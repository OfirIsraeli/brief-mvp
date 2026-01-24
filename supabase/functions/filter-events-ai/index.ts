import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
};

// Logger with trace ID prefix
const createLogger = (traceId?: string) => ({
  log: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : '[filter-events-ai]';
    console.log(`${prefix} ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : '[filter-events-ai]';
    console.error(`${prefix} ${message}`, ...args);
  },
});

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
  imageUrl?: string;
  description?: string;
}

interface FilterRequest {
  traceId?: string;
  rawEvents: Event[];
  genres: string[];
  artists: string[];
  briefName: string;
}

interface FilteredEvent extends Event {
  relevanceScore: number;
  matchedGenres: string[];
  matchedArtists: string[];
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Get trace ID from header or body
  const headerTraceId = req.headers.get('X-Trace-Id');

  try {
    const { rawEvents, genres, artists, briefName, traceId: bodyTraceId } = await req.json() as FilterRequest;
    const traceId = headerTraceId || bodyTraceId;
    const logger = createLogger(traceId);
    
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      logger.error("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured", traceId }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!rawEvents || rawEvents.length === 0) {
      logger.log("No events to filter");
      return new Response(
        JSON.stringify({ events: [], filteredCount: 0, traceId }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    logger.log(`Filtering ${rawEvents.length} events for brief "${briefName}" with genres: [${genres.join(', ')}] and artists: [${artists.join(', ')}]`);

    // If no genres and no artists specified, return all events
    if ((!genres || genres.length === 0) && (!artists || artists.length === 0)) {
      logger.log("No filtering criteria specified, returning all events");
      return new Response(
        JSON.stringify({ 
          events: rawEvents,
          filteredCount: rawEvents.length,
          totalCount: rawEvents.length,
          traceId,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Prepare event summaries for AI analysis (batch processing)
    const eventSummaries = rawEvents.map((event, index) => ({
      index,
      title: event.title,
      venue: event.venue,
      description: event.description || '',
      date: event.date,
    }));

    // Build the AI prompt
    const systemPrompt = `You are an event relevance analyzer. Your task is to determine which events are relevant to a user's music/entertainment preferences.

The user is interested in the following genres: ${genres.length > 0 ? genres.join(', ') : 'Any genre'}
The user is interested in the following artists: ${artists.length > 0 ? artists.join(', ') : 'Any artist'}

For each event, analyze the title and description to determine if it matches the user's preferences. Consider:
1. Direct matches: Event explicitly mentions a preferred genre or artist
2. Related genres: Event is related to preferred genres (e.g., "Hip Hop" matches "Rap", "Electronic" matches "Techno", "DJ set")
3. Cultural context: Consider Hebrew event names and Israeli music scene terminology
4. Venue type: Consider that certain venues specialize in certain genres

Be inclusive rather than exclusive - if there's reasonable chance the event matches the user's preferences, include it.`;

    const userPrompt = `Analyze these events and return ONLY a JSON array of indices (0-based) for events that are relevant to the user's preferences.

Events to analyze:
${JSON.stringify(eventSummaries, null, 2)}

Return a JSON object with this exact format:
{
  "relevantIndices": [0, 2, 5],
  "reasoning": "Brief explanation of why these events were selected"
}

IMPORTANT: Return ONLY the JSON object, no markdown formatting or additional text.`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Lower temperature for more consistent results
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        logger.error("AI rate limit exceeded");
        // Fallback: return all events if rate limited
        return new Response(
          JSON.stringify({ 
            events: rawEvents,
            filteredCount: rawEvents.length,
            totalCount: rawEvents.length,
            warning: "AI rate limit exceeded, returning all events",
            traceId,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      if (aiResponse.status === 402) {
        logger.error("AI credits exhausted");
        return new Response(
          JSON.stringify({ 
            events: rawEvents,
            filteredCount: rawEvents.length,
            totalCount: rawEvents.length,
            warning: "AI credits exhausted, returning all events",
            traceId,
          }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      const errorText = await aiResponse.text();
      logger.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    logger.log("AI response received");

    // Parse AI response
    let relevantIndices: number[] = [];
    let reasoning = '';
    
    try {
      // Try to parse the JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        relevantIndices = parsed.relevantIndices || [];
        reasoning = parsed.reasoning || '';
      } else {
        // Fallback: try to extract array directly
        const arrayMatch = aiContent.match(/\[([\d,\s]+)\]/);
        if (arrayMatch) {
          relevantIndices = JSON.parse(`[${arrayMatch[1]}]`);
        }
      }
    } catch (parseError) {
      logger.error("Error parsing AI response:", String(parseError));
      // Fallback: return all events
      relevantIndices = rawEvents.map((_, i) => i);
    }

    // Filter events based on AI response
    const filteredEvents: Event[] = relevantIndices
      .filter(index => index >= 0 && index < rawEvents.length)
      .map(index => rawEvents[index]);

    logger.log(`AI filtered to ${filteredEvents.length} relevant events. Reasoning: ${reasoning}`);

    return new Response(
      JSON.stringify({
        events: filteredEvents,
        filteredCount: filteredEvents.length,
        totalCount: rawEvents.length,
        reasoning,
        traceId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[filter-events-ai] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
