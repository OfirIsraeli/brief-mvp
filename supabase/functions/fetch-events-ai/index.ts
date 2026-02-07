import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
};

// Logger with trace ID prefix
const createLogger = (traceId?: string) => ({
  log: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : '[fetch-events-ai]';
    console.log(`${prefix} ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : '[fetch-events-ai]';
    console.error(`${prefix} ${message}`, ...args);
  },
});

interface Brief {
  artists: string[];
  genres: string[];
  venues: string[];
  schedule: {
    eventWindow: string;
  };
}

interface Event {
  event_name: string;
  artists: string[];
  genres: string[];
  date: string;
  venue: string;
  event_url: string;
}

// Map venue IDs to display names for the prompt
const VENUE_MAP: Record<string, string> = {
  'barby': 'barby',
  'teder': 'teder.fm',
  'levontin7': 'levontin 7',
  'kuli-alma': 'kuli alma',
  'ozen-bar': 'ozentelaviv',
  'suzanne-dellal': 'suzanne dellal',
  'secret-telaviv': 'secret tel aviv',
  'go-out': 'go out',
  'eventim': 'eventim',
  'ticketmaster': 'ticketmaster',
  'artport': 'artport',
  'tlv-municipality': 'tel aviv municipality',
};

// Convert event window to time description
const getTimeWindowDescription = (eventWindow: string): string => {
  const now = new Date();
  const currentMonth = now.toLocaleString('en-US', { month: 'long' });
  const currentYear = now.getFullYear();
  
  switch (eventWindow) {
    case 'This weekend':
      return `this weekend (${now.toISOString().split('T')[0]} to next Sunday)`;
    case 'Next 7 days':
      return `from now to ${new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`;
    case 'Next 2 weeks':
      return `from now to ${new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`;
    case 'This month':
      return `from now to end of ${currentMonth} ${currentYear}`;
    default:
      return `from now to end of ${currentMonth} ${currentYear}`;
  }
};

// Build the prompt with brief parameters
const buildPrompt = (brief: Brief): string => {
  const preferredArtists = brief.artists?.length > 0 
    ? brief.artists.join(', ') 
    : 'none specified';
  
  const preferredGenres = brief.genres?.length > 0 
    ? brief.genres.join(', ') 
    : 'any genre';
  
  const allowedVenues = brief.venues?.length > 0 
    ? brief.venues.map(v => VENUE_MAP[v] || v).join(', ') 
    : 'any venue in Tel Aviv';
  
  const timeWindow = getTimeWindowDescription(brief.schedule?.eventWindow || 'This month');

  return `Role You are an event discovery and ranking engine. Your task is to identify, filter, rank, and summarize upcoming live events in Tel Aviv that best match a user's stated preferences.

Inputs
preferred_artists: ${preferredArtists}
preferred_genres: ${preferredGenres}
time_window: ${timeWindow}
allowed_venues: ${allowedVenues}

Venue matching must be exact string match

Hard Filters (mandatory — discard events failing any condition)
- Event is not sold out
- Event date is within the specified time window
- Event venue exactly matches one of allowed_venues
- Event location is Tel Aviv
- Event has a valid public event URL

Ranking Logic
Assign each event a relevance tier based on the first rule it matches (higher tier = higher relevance):
1. Exact artist match - Event includes ≥1 artist that exactly matches an entry in preferred_artists
2. Artist affinity + exact genre - Event includes artists commonly liked by fans of any preferred_artist AND includes ≥1 genre that exactly matches preferred_genres
3. Artist affinity + similar genre - Event includes artists commonly liked by fans of any preferred_artist AND includes ≥1 genre similar (but not identical) to a preferred genre
4. Exact genre match - Event includes ≥1 genre that exactly matches preferred_genres

Events that do not match any ranking rule must be excluded.

Tie-breaking
Within the same relevance tier, sort by earliest event date (ascending)

Output Constraints
- Return at most 10 events
- Results must already be filtered, ranked, and sorted
- Output only a valid JSON array
- Do not include explanatory text, comments, or metadata

Output Schema (per event)
{
  "event_name": "string",
  "artists": ["string"],
  "genres": ["string"],
  "date": "ISO-8601 string",
  "venue": "string",
  "event_url": "string"
}

Strict Rules
- Do not invent or hallucinate events, artists, venues, genres, or URLs
- Do not infer missing fields
- If fewer than 10 valid events exist, return only those found
- If no events match, return an empty JSON array ([])`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const headerTraceId = req.headers.get('X-Trace-Id');

  try {
    const body = await req.json();
    const { brief, traceId: bodyTraceId } = body;
    const traceId = headerTraceId || bodyTraceId;
    const logger = createLogger(traceId);

    if (!brief) {
      return new Response(
        JSON.stringify({ error: 'Brief is required', traceId }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      logger.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured', traceId }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const prompt = buildPrompt(brief);
    logger.log('Built prompt for AI event discovery');
    logger.log(`Brief params - Artists: ${brief.artists?.join(', ') || 'none'}, Genres: ${brief.genres?.join(', ') || 'none'}, Venues: ${brief.venues?.join(', ') || 'all'}, Window: ${brief.schedule?.eventWindow || 'default'}`);

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'You are an expert event discovery assistant specializing in Tel Aviv nightlife, concerts, and cultural events. You have access to current event listings and can accurately identify and rank events based on user preferences. Always respond with valid JSON arrays only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3, // Lower temperature for more consistent, factual responses
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later', traceId }),
          { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted', traceId }),
          { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI service error', traceId }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';
    
    logger.log('Received AI response, parsing events...');

    // Parse the JSON response
    let events: Event[] = [];
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```json')) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith('```')) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();

      events = JSON.parse(cleanContent);
      
      if (!Array.isArray(events)) {
        logger.error('AI response is not an array');
        events = [];
      }
    } catch (parseError) {
      logger.error('Failed to parse AI response:', String(parseError));
      logger.error('Raw content:', content.substring(0, 500));
      events = [];
    }

    logger.log(`AI discovered ${events.length} matching events`);

    return new Response(
      JSON.stringify({
        events,
        traceId,
        discoveredAt: new Date().toISOString(),
        briefParams: {
          artists: brief.artists || [],
          genres: brief.genres || [],
          venues: brief.venues || [],
          eventWindow: brief.schedule?.eventWindow || 'default',
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[fetch-events-ai] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage, traceId: headerTraceId }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
