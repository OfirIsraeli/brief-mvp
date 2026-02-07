import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a unique trace ID for observability
const generateTraceId = (): string => {
  return `manual_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
};

// Logger with trace ID prefix
const createLogger = (traceId: string) => ({
  log: (message: string, ...args: unknown[]) => {
    console.log(`[${traceId}] ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[${traceId}] ${message}`, ...args);
  },
});

interface Brief {
  id: string;
  user_id: string;
  name: string;
  artists: string[];
  genres: string[];
  venues: string[];
  schedule: {
    dayOfWeek: string;
    time: string;
    eventWindow: string;
  };
  delivery_method: string;
  delivery_contact: string;
  is_active: boolean;
}

interface Event {
  id: string;
  title: string;
  venue: string;
  venueId: string;
  date: string;
  time?: string;
  artists?: string[];
  genres?: string[];
  url?: string;
  description?: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Generate trace ID for this manual trigger
  const traceId = generateTraceId();
  const logger = createLogger(traceId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', traceId }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create client with user's auth token to verify ownership
    const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await userSupabase.auth.getClaims(token);
    
    if (claimsError || !claims?.claims) {
      logger.error("Auth validation failed:", claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', traceId }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claims.claims.sub;
    logger.log(`Manual trigger initiated by user ${userId}`);

    // Parse request body
    const { briefId } = await req.json();
    
    if (!briefId) {
      return new Response(
        JSON.stringify({ error: 'Brief ID is required', traceId }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    logger.log(`Triggering brief: ${briefId}`);

    // Use service role client to fetch the brief
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch the specific brief and verify ownership
    const { data: brief, error: briefError } = await supabase
      .from('briefs')
      .select('*')
      .eq('id', briefId)
      .eq('user_id', userId)
      .single();

    if (briefError || !brief) {
      logger.error("Brief not found or access denied:", briefError?.message);
      return new Response(
        JSON.stringify({ error: 'Brief not found or access denied', traceId }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const typedBrief = brief as Brief;
    logger.log(`Processing brief: ${typedBrief.name}`);

    // Step 1: Discover events using AI
    logger.log(`Step 1: AI event discovery...`);
    const fetchEventsAiResponse = await fetch(
      `${supabaseUrl}/functions/v1/fetch-events-ai`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'X-Trace-Id': traceId,
        },
        body: JSON.stringify({
          traceId,
          brief: {
            venues: typedBrief.venues,
            genres: typedBrief.genres,
            artists: typedBrief.artists,
            schedule: typedBrief.schedule,
          },
        }),
      }
    );

    if (!fetchEventsAiResponse.ok) {
      const errorText = await fetchEventsAiResponse.text();
      throw new Error(`Failed to discover events: ${errorText}`);
    }

    const discoveryResult = await fetchEventsAiResponse.json() as { 
      events: Array<{
        event_name: string;
        artists: string[];
        genres: string[];
        date: string;
        venue: string;
        event_url: string;
      }>;
    };
    
    // Map AI response format to Event format
    const events: Event[] = discoveryResult.events.map((e, idx) => ({
      id: `ai-${Date.now()}-${idx}`,
      title: e.event_name,
      venue: e.venue,
      venueId: e.venue.toLowerCase().replace(/\s+/g, '-'),
      date: e.date,
      artists: e.artists,
      genres: e.genres,
      url: e.event_url,
    }));
    
    logger.log(`AI discovered ${events.length} matching events`);

    // Step 3: Send the digest with filtered events
    logger.log(`Step 3: Sending digest...`);
    const sendDigestResponse = await fetch(
      `${supabaseUrl}/functions/v1/send-digest`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'X-Trace-Id': traceId,
        },
        body: JSON.stringify({
          traceId,
          deliveryMethod: typedBrief.delivery_method,
          deliveryContact: typedBrief.delivery_contact,
          briefName: typedBrief.name,
          events,
        }),
      }
    );

    if (!sendDigestResponse.ok) {
      const errorText = await sendDigestResponse.text();
      throw new Error(`Failed to send digest: ${errorText}`);
    }

    logger.log(`Successfully triggered and sent digest for brief: ${typedBrief.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        traceId,
        briefId: typedBrief.id,
        briefName: typedBrief.name,
        eventsDiscovered: events.length,
        deliveryMethod: typedBrief.delivery_method,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Error triggering brief:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, traceId }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
