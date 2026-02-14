import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a unique trace ID for observability
const generateTraceId = (): string => {
  return `trace_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
};

const EDGE_FUNCTION_NAME = "process-scheduled-briefs";

// Logger with trace ID prefix and edge function name context
const createLogger = (traceId: string) => ({
  log: (message: string, ...args: unknown[]) => {
    console.log(`[${traceId}] ${message}`, { edge_function_name: EDGE_FUNCTION_NAME, ...((typeof args[0] === "object" && args[0] !== null) ? args[0] as Record<string, unknown> : {}) }, ...(typeof args[0] === "object" ? args.slice(1) : args));
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[${traceId}] ${message}`, { edge_function_name: EDGE_FUNCTION_NAME, ...((typeof args[0] === "object" && args[0] !== null) ? args[0] as Record<string, unknown> : {}) }, ...(typeof args[0] === "object" ? args.slice(1) : args));
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Get current time in Israel timezone
const getIsraelTime = (): Date => {
  const now = new Date();
  // Convert to Israel time using Intl.DateTimeFormat
  const israelTimeStr = now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  return new Date(israelTimeStr);
};

// Check if a brief should be sent now based on its schedule (in Israel time)
const shouldSendBrief = (schedule: Brief['schedule']): boolean => {
  const israelNow = getIsraelTime();
  const currentDay = DAYS_OF_WEEK[israelNow.getDay()];
  const currentHour = israelNow.getHours();
  const currentMinute = israelNow.getMinutes();
  
  // Parse scheduled time (e.g., "23:15" -> hour: 23, minute: 15)
  const [scheduledHour, scheduledMinute] = schedule.time.split(':').map(Number);
  
  // Check if it's the right day and within a 10-minute window of the scheduled time
  // This accounts for cron running every 10 minutes
  if (schedule.dayOfWeek !== currentDay) {
    return false;
  }
  
  const scheduledTotalMinutes = scheduledHour * 60 + scheduledMinute;
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  // Send if we're within 10 minutes after the scheduled time
  // This ensures the brief is sent during the cron run closest to the scheduled time
  return currentTotalMinutes >= scheduledTotalMinutes && 
         currentTotalMinutes < scheduledTotalMinutes + 10;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Generate trace ID for this request
  const traceId = generateTraceId();
  const logger = createLogger(traceId);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    logger.log("Starting scheduled brief processing...");
    const processStart = new Date().toISOString();

    // Fetch all active briefs
    const { data: briefs, error: briefsError } = await supabase
      .from('briefs')
      .select('*')
      .eq('is_active', true);

    if (briefsError) {
      throw new Error(`Failed to fetch briefs: ${briefsError.message}`);
    }

    logger.log(`Found ${briefs?.length || 0} active briefs`);

    const results: Array<{
      briefId: string;
      briefName: string;
      status: 'sent' | 'skipped' | 'error';
      reason?: string;
      eventsCount?: number;
      traceId?: string;
    }> = [];

    // Process each brief
    for (const brief of (briefs as Brief[]) || []) {
      // Generate a sub-trace for each brief
      const briefTraceId = `${traceId}_${brief.id.slice(0, 8)}`;
      const briefLogger = createLogger(briefTraceId);
      
      briefLogger.log(`Processing brief: ${brief.name}`);

      // Check if this brief should be sent now based on schedule
      if (!shouldSendBrief(brief.schedule)) {
        briefLogger.log(`Skipping: not scheduled for now`);
        results.push({
          briefId: brief.id,
          briefName: brief.name,
          status: 'skipped',
          reason: 'Not scheduled for current time',
          traceId: briefTraceId,
        });
        continue;
      }

      try {
        // Step 1: Discover events using AI
        briefLogger.log(`Step 1: AI event discovery...`);
        const fetchEventsAiResponse = await fetch(
          `${supabaseUrl}/functions/v1/fetch-events-ai`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'X-Trace-Id': briefTraceId,
            },
            body: JSON.stringify({
              traceId: briefTraceId,
              brief: {
                venues: brief.venues,
                genres: brief.genres,
                artists: brief.artists,
                schedule: brief.schedule,
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
        
        briefLogger.log(`AI discovered ${events.length} matching events`);

        // Step 3: Send the digest with filtered events
        briefLogger.log(`Step 3: Sending digest...`);
        const sendDigestResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-digest`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'X-Trace-Id': briefTraceId,
            },
            body: JSON.stringify({
              traceId: briefTraceId,
              deliveryMethod: brief.delivery_method,
              deliveryContact: brief.delivery_contact,
              briefName: brief.name,
              events,
            }),
          }
        );

        if (!sendDigestResponse.ok) {
          const errorText = await sendDigestResponse.text();
          throw new Error(`Failed to send digest: ${errorText}`);
        }

        await sendDigestResponse.json();

        results.push({
          briefId: brief.id,
          briefName: brief.name,
          status: 'sent',
          eventsCount: events.length,
          traceId: briefTraceId,
        });

        briefLogger.log(`Successfully sent digest`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        briefLogger.error(`Error processing brief:`, errorMessage);
        results.push({
          briefId: brief.id,
          briefName: brief.name,
          status: 'error',
          reason: errorMessage,
          traceId: briefTraceId,
        });
      }
    }

    const summary = {
      traceId,
      processedAt: processStart,
      completedAt: new Date().toISOString(),
      totalBriefs: briefs?.length || 0,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    };

    logger.log("Processing complete:", JSON.stringify(summary));

    return new Response(
      JSON.stringify(summary),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Error in process-scheduled-briefs:", errorMessage);
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
