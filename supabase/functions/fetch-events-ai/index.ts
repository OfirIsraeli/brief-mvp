import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
};

// Logger with trace ID prefix
const createLogger = (traceId?: string) => ({
  log: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : "[fetch-events-ai]";
    console.log(`${prefix} ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    const prefix = traceId ? `[${traceId}]` : "[fetch-events-ai]";
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

type KnownGenre = (typeof KNOWN_GENRES)[number];

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

// Domains per venue/source. We use this to ground discovery via Firecrawl search so the LLM
// can only extract from REAL pages instead of either hallucinating or returning [].
const VENUE_DOMAINS: Record<string, string[]> = {
  barby: ["barby.co.il"],
  teder: ["teder.fm"],
  levontin7: ["levontin7.com"],
  "kuli-alma": ["facebook.com", "instagram.com"],
  "ozen-bar": ["ozen.co.il"],
  "suzanne-dellal": ["suzannedellal.org.il"],
  artport: ["artport.art"],
  "secret-telaviv": ["secrettelaviv.com"],
  "go-out": ["go-out.co"],
  eventim: ["eventim.co.il"],
  ticketmaster: ["ticketmaster.co.il"],
  "tlv-municipality": ["tel-aviv.gov.il"],
};

type SourceDoc = {
  url: string;
  title?: string;
  markdown: string;
};

const truncate = (text: string, maxChars: number) =>
  text.length > maxChars ? `${text.slice(0, maxChars)}\n…(truncated)` : text;

const extractUrls = (text: string): string[] => {
  const matches = text.match(/https?:\/\/[^\s)\]}>"']+/g);
  return matches ? Array.from(new Set(matches)) : [];
};

const buildAllowedUrlSets = (sources: SourceDoc[]) => {
  const urls = new Set<string>();
  const hosts = new Set<string>();

  for (const s of sources) {
    urls.add(s.url);
    try {
      hosts.add(new URL(s.url).host);
    } catch {
      // ignore
    }

    for (const u of extractUrls(s.markdown)) {
      urls.add(u);
      try {
        hosts.add(new URL(u).host);
      } catch {
        // ignore
      }
    }
  }

  return { urls, hosts };
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

  const description = `${start.toISOString().split("T")[0]} to ${end.toISOString().split("T")[0]}`;
  return { start, end, description };
};

const buildSearchQueries = (brief: Brief): string[] => {
  const venueIds = brief.venues?.length ? brief.venues : Object.keys(VENUE_DOMAINS);
  const year = new Date().getFullYear();

  const queries: string[] = [];

  for (const venueId of venueIds) {
    const domains = VENUE_DOMAINS[venueId] || [];
    const domain = domains[0];
    if (!domain) continue;

    queries.push(`site:${domain} Tel Aviv events ${year}`);
  }

  return Array.from(new Set(queries)).slice(0, 6);
};

const firecrawlSearch = async (
  query: string,
  logger: ReturnType<typeof createLogger>,
): Promise<SourceDoc[]> => {
  const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!firecrawlApiKey) {
    logger.error("FIRECRAWL_API_KEY not configured");
    return [];
  }

  const resp = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      limit: 3,
      scrapeOptions: {
        formats: ["markdown"],
      },
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    logger.error(`Firecrawl search failed (${resp.status})`, t.slice(0, 500));
    return [];
  }

  const data = (await resp.json()) as {
    success?: boolean;
    data?: Array<{ url?: string; title?: string; markdown?: string; content?: string }>;
  };

  const items = data.data || [];
  return items
    .map((it) => {
      const url = typeof it.url === "string" ? it.url : "";
      const markdown = (
        typeof it.markdown === "string"
          ? it.markdown
          : typeof it.content === "string"
            ? it.content
            : ""
      ).trim();
      if (!url || !markdown) return null;
      return { url, title: it.title, markdown } satisfies SourceDoc;
    })
    .filter((x): x is SourceDoc => Boolean(x));
};

const gatherSources = async (
  brief: Brief,
  logger: ReturnType<typeof createLogger>,
): Promise<SourceDoc[]> => {
  const queries = buildSearchQueries(brief);
  if (queries.length === 0) return [];

  logger.log(`Firecrawl: running ${queries.length} search queries`);

  const results = await Promise.all(
    queries.map(async (q) => {
      try {
        return await firecrawlSearch(q, logger);
      } catch (e) {
        logger.error("Firecrawl query failed:", q, String(e));
        return [];
      }
    }),
  );

  const flattened = results.flat();
  const byUrl = new Map<string, SourceDoc>();
  for (const s of flattened) {
    if (!byUrl.has(s.url)) byUrl.set(s.url, s);
  }

  return Array.from(byUrl.values()).slice(0, 8);
};

const validateAndFilterEvents = (
  raw: unknown,
  opts: {
    brief: Brief;
    allowedUrls: Set<string>;
    allowedHosts: Set<string>;
    start: Date;
    end: Date;
    logger: ReturnType<typeof createLogger>;
  },
): Event[] => {
  if (!Array.isArray(raw)) return [];

  const preferredGenres = new Set(
    (opts.brief.genres || [])
      .map((g) => g.toLowerCase().trim())
      .filter(Boolean),
  );

  const applyGenreFilter = preferredGenres.size > 0 && !isAllGenresSelection(opts.brief.genres);

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

    // URL grounding validation
    let host = "";
    try {
      host = new URL(event_url).host;
    } catch {
      continue;
    }

    const urlOk = opts.allowedUrls.has(event_url) || (host && opts.allowedHosts.has(host));
    if (!urlOk) continue;

    // Genre intersection (only when user picked a subset of genres)
    if (applyGenreFilter) {
      const hasGenre = genres.some((g) => preferredGenres.has(g.toLowerCase().trim()));
      if (!hasGenre) continue;
    }

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

// Build the LLM prompt using brief parameters + grounded sources
const buildPrompt = (brief: Brief, sources: SourceDoc[]): string => {
  const preferredArtists = brief.artists?.length > 0 ? brief.artists.join(", ") : "none specified";
  const allGenres = isAllGenresSelection(brief.genres);
  const preferredGenres = !brief.genres?.length || allGenres ? "any genre" : brief.genres.join(", ");
  const allowedVenues = brief.venues?.length > 0
    ? brief.venues.map((v) => VENUE_MAP[v] || v).join(", ")
    : "any venue in Tel Aviv";

  const hostVenueHints = Object.entries(VENUE_DOMAINS)
    .flatMap(([venueId, domains]) => domains.map((d) => `${d} => ${VENUE_MAP[venueId] || venueId}`))
    .join("\n");

  const window = getTimeWindowRange(brief.schedule?.eventWindow || "This month");

  const sourceBlock = sources.length
    ? sources
        .map((s, idx) => {
          const md = truncate(s.markdown, 4000);
          return `SOURCE_${idx + 1}\nurl: ${s.url}\ncontent:\n${md}`;
        })
        .join("\n\n")
    : "NO_SOURCES_AVAILABLE";

  return `You are a fact-grounded event extraction engine.

You are given a set of web sources (URL + scraped content). You MUST only extract events that are explicitly present in the sources.
Do NOT use outside knowledge. Do NOT invent events, dates, venues, artists, genres, or URLs.

User preferences
preferred_artists: ${preferredArtists}
preferred_genres: ${preferredGenres}
time_window: ${window.description}
allowed_venues: ${allowedVenues}
location: Tel Aviv

Output Rules
- Output ONLY a valid JSON array (no markdown, no commentary)
- Return at most 10 events
- If no matching events are explicitly present in sources, return []

Output Schema (per event)
{
  "event_name": "string",
  "artists": ["string"],
  "genres": ["string"],
  "date": "ISO-8601 string",
  "venue": "string",
  "event_url": "string"
}

Hard Requirements
- event_url MUST be a valid public URL that appears in the sources content OR, if none is present for that event, use the SOURCE url where the event is mentioned.
- date MUST be within the given time_window.
${isAllGenresSelection(brief.genres) || !brief.genres?.length ? "- genre: no filtering required.\n" : "- genre MUST include at least one of preferred_genres.\n"}

Sources
${sourceBlock}`;
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

    logger.log("Gathering grounded sources for event extraction...");
    const sources = await gatherSources(brief as Brief, logger);
    logger.log(`Sources gathered: ${sources.length}`);
    logger.log(
      "Source URLs:",
      sources.map((s) => s.url),
    );
    // If we have zero sources, the non-hallucination constraints will almost always produce [].
    // Return early with diagnostics so it's obvious why.
    if (sources.length === 0) {
      logger.error("No grounded sources found (Firecrawl returned 0 results); returning empty events list");
      return new Response(
        JSON.stringify({
          events: [],
          traceId,
          discoveredAt: new Date().toISOString(),
          briefParams: {
            artists: (brief as Brief).artists || [],
            genres: (brief as Brief).genres || [],
            venues: (brief as Brief).venues || [],
            eventWindow: (brief as Brief).schedule?.eventWindow || "default",
          },
          diagnostics: {
            sourceCount: 0,
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        },
      );
    }

    const prompt = buildPrompt(brief as Brief, sources);
    const window = getTimeWindowRange((brief as Brief).schedule?.eventWindow || "This month");
    const { urls: allowedUrls, hosts: allowedHosts } = buildAllowedUrlSets(sources);

    logger.log("Built grounded extraction prompt for AI");
    logger.log(
      `Brief params - Artists: ${(brief as Brief).artists?.join(", ") || "none"}, Genres: ${(brief as Brief).genres?.join(", ") || "none"}, Venues: ${(brief as Brief).venues?.join(", ") || "all"}, Window: ${(brief as Brief).schedule?.eventWindow || "default"}`,
    );

    // Call Lovable AI Gateway. We do NOT rely on web browsing inside the model.
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
            content:
              "You extract structured events strictly from provided sources. Output JSON array only. Never invent facts.",
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
      sourceCount: sources.length,
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
        allowedUrls,
        allowedHosts,
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
          sourceCount: sources.length,
          aiFinishReason: finishReason,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[fetch-events-ai] Error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage, traceId: headerTraceId }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
