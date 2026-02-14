import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
};

const EDGE_FUNCTION_NAME = "fetch-events-ai";

// Logger with trace ID prefix and edge function name context
const createLogger = (traceId?: string) => ({
  log: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : `[${EDGE_FUNCTION_NAME}]`;
    console.log(`${prefix} ${message}`, { edge_function_name: EDGE_FUNCTION_NAME, ...((typeof args[0] === "object" && args[0] !== null) ? args[0] as Record<string, unknown> : {}) }, ...(typeof args[0] === "object" ? args.slice(1) : args));
  },
  error: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : `[${EDGE_FUNCTION_NAME}]`;
    console.error(`${prefix} ${message}`, { edge_function_name: EDGE_FUNCTION_NAME, ...((typeof args[0] === "object" && args[0] !== null) ? args[0] as Record<string, unknown> : {}) }, ...(typeof args[0] === "object" ? args.slice(1) : args));
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

// Frontend "all genres" selection currently means the user wants *any* genre.
// If we keep treating it as a strict filter, we end up discarding most real events
// because venue pages rarely label genres explicitly.
const KNOWN_GENRES = [
  "Indie Rock",
  "Jazz",
  "Electronic",
  "Hip Hop",
  "Classical",
  "World Music",
  "Pop",
  "R&B",
  "Alternative",
  "Folk",
  "Punk",
  "Metal",
] as const;

const isAllGenresSelection = (genres: string[] | undefined | null): boolean => {
  if (!genres || genres.length === 0) return false;
  const selected = new Set(genres.map((g) => g.trim()).filter(Boolean));
  // If user selected every known genre, treat it as "no genre filter".
  return KNOWN_GENRES.every((g) => selected.has(g));
};

// Map venue IDs to display names for the prompt
const VENUE_MAP: Record<string, string> = {
  barby: "barby",
  teder: "teder.fm",
  levontin7: "levontin 7",
  "kuli-alma": "kuli alma",
  "ozen-bar": "ozentelaviv",
  "suzanne-dellal": "suzanne dellal",
  "secret-telaviv": "secret tel aviv",
  "go-out": "go out",
  eventim: "eventim",
  ticketmaster: "ticketmaster",
  artport: "artport",
  "tlv-municipality": "tel aviv municipality",
};

// Convert event window to a concrete date range
const getTimeWindowRange = (eventWindow: string) => {
  const start = new Date();
  const normalized = eventWindow || "This month";

  const end = new Date(start);

  switch (normalized) {
    case "This weekend": {
      // End of upcoming Sunday (UTC)
      const daysUntilSunday = (7 - end.getUTCDay()) % 7;
      end.setUTCDate(end.getUTCDate() + daysUntilSunday);
      end.setUTCHours(23, 59, 59, 999);
      break;
    }
    case "Next 7 days": {
      end.setUTCDate(end.getUTCDate() + 7);
      break;
    }
    case "Next 2 weeks": {
      end.setUTCDate(end.getUTCDate() + 14);
      break;
    }
    case "This month":
    default: {
      const y = end.getUTCFullYear();
      const m = end.getUTCMonth();
      const last = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
      end.setTime(last.getTime());
      break;
    }
  }

  const startDate = start.toISOString().split("T")[0];
  const endDate = end.toISOString().split("T")[0];
  return { start, end, startDate, endDate };
};

const validateAndFilterEvents = (
  raw: unknown,
  opts: {
    brief: Brief;
    start: Date;
    end: Date;
    logger: ReturnType<typeof createLogger>;
  }
): Event[] => {
  if (!Array.isArray(raw)) return [];

  const out: Event[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;

    const event_name = typeof e.event_name === "string" ? e.event_name.trim() : "";
    const venue = typeof e.venue === "string" ? e.venue.trim() : "";
    const date = typeof e.date === "string" ? e.date.trim() : "";
    const event_url = typeof e.event_url === "string" ? e.event_url.trim() : "";

    const artists = Array.isArray(e.artists)
      ? e.artists
          .filter((a) => typeof a === "string")
          .map((a) => a.trim())
          .filter(Boolean)
      : [];
    const genres = Array.isArray(e.genres)
      ? e.genres
          .filter((g) => typeof g === "string")
          .map((g) => g.trim())
          .filter(Boolean)
      : [];

    if (!event_name || !date || !venue || !event_url) continue;

    // Date window validation
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) continue;
    if (parsed < opts.start || parsed > opts.end) continue;

    out.push({ event_name, artists, genres, date, venue, event_url });
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = out.filter((e) => {
    if (seen.has(e.event_url)) return false;
    seen.add(e.event_url);
    return true;
  });

  return deduped.slice(0, 10);
};

// Build the LLM prompt using brief parameters
const buildPrompt = (brief: Brief, logger: ReturnType<typeof createLogger>): string => {
  const window = getTimeWindowRange(brief.schedule?.eventWindow || "This month");

  // Build inputs section conditionally
  const inputs: string[] = [];

  if (brief.artists?.length > 0) {
    inputs.push(`preferred_artists: ${brief.artists.join(", ")}`);
  }

  const allGenres = isAllGenresSelection(brief.genres);
  if (brief.genres?.length && !allGenres) {
    inputs.push(`preferred_genres: ${brief.genres.join(", ")}`);
  }

  inputs.push(`time_window: ${window.startDate} to ${window.endDate}`);

  if (brief.venues?.length > 0) {
    const venueNames = brief.venues.map((v) => VENUE_MAP[v] || v).join(", ");
    inputs.push(`allowed_venues: ${venueNames}`);
  }

  logger.log(`Prompt inputs: ${inputs.join(" | ")}`);

  return `Role
You are an event discovery and ranking engine.
Your task is to identify, filter, rank, and summarize upcoming live events in Tel Aviv that best match a user's stated preferences.

Inputs
${inputs.join("\n")}

Hard Filters (mandatory — discard events failing any condition)
- Event is not sold out
- Event date is within the specified time window
- Event venue exactly matches one of allowed_venues
- Event location is Tel Aviv
- Event has a valid public event URL

Sorting / Ranking Logic
Assign each event a relevance tier based on the first rule it matches (higher tier = higher relevance):
1. Exact artist match
   Event includes ≥1 artist that exactly matches an entry in preferred_artists
2. Artist affinity + exact genre
   Event includes artists commonly liked by fans of any preferred_artist AND includes ≥1 genre that exactly matches preferred_genres
3. Artist affinity + similar genre
   Event includes artists commonly liked by fans of any preferred_artist AND includes ≥1 genre similar (but not identical) to a preferred genre
4. Exact genre match
   Event includes ≥1 genre that exactly matches preferred_genres

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

  const headerTraceId = req.headers.get("X-Trace-Id");

  try {
    const body = await req.json();
    const { brief, traceId: bodyTraceId } = body;
    const traceId = headerTraceId || bodyTraceId;
    const logger = createLogger(traceId);

    if (!brief) {
      return new Response(JSON.stringify({ error: "Brief is required", traceId }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      logger.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured", traceId }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    logger.log("Building prompt for event discovery...");
    const prompt = buildPrompt(brief as Brief, logger);
    const window = getTimeWindowRange((brief as Brief).schedule?.eventWindow || "This month");

    logger.log("Built event discovery prompt for AI");
    logger.log(`Full prompt:\n ${prompt}`);

    // Call Lovable AI Gateway for event discovery
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          {
            role: "system",
            content: "You are an event discovery engine. You discover real upcoming events and rank them by relevance. Output JSON array only.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_completion_tokens: 2200,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      logger.error("AI Gateway error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later", traceId }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted", traceId }), {
          status: 402,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ error: "AI service error", traceId }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";

    const finishReason = aiData.choices?.[0]?.finish_reason;
    logger.log("AI response received", {
      finishReason,
      contentChars: typeof content === "string" ? content.length : 0,
    });

    // Parse the JSON response
    let events: Event[] = [];
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanContent = String(content).trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      } else if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();

      const parsed = JSON.parse(cleanContent);
      const validated = validateAndFilterEvents(parsed, {
        brief: brief as Brief,
        start: window.start,
        end: window.end,
        logger,
      });

      events = validated;
    } catch (parseError) {
      logger.error("Failed to parse AI response:", String(parseError));
      logger.error("Raw content (first 500 chars):", String(content).substring(0, 500));
      events = [];
    }

    logger.log(`Discovered ${events.length} validated events`);
    logger.log("Discovered events:", JSON.stringify(events, null, 2));

    return new Response(
      JSON.stringify({
        events,
        traceId,
        discoveredAt: new Date().toISOString(),
        briefParams: {
          artists: (brief as Brief).artists || [],
          genres: (brief as Brief).genres || [],
          venues: (brief as Brief).venues || [],
          eventWindow: (brief as Brief).schedule?.eventWindow || "default",
        },
        diagnostics: {
          aiFinishReason: finishReason,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[${EDGE_FUNCTION_NAME}] Error:`, errorMessage, { edge_function_name: EDGE_FUNCTION_NAME });
    return new Response(JSON.stringify({ error: errorMessage, traceId: headerTraceId }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
