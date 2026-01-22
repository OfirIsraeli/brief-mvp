import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

interface VenueConfig {
  id: string;
  name: string;
  url: string;
  scrapeType: 'html' | 'rss';
}

// Venue configurations based on PRD Appendix A
const VENUE_CONFIGS: Record<string, VenueConfig> = {
  'barby': {
    id: 'barby',
    name: 'Barby',
    url: 'https://barby.co.il',
    scrapeType: 'html',
  },
  'teder': {
    id: 'teder',
    name: 'Teder.fm',
    url: 'https://teder.fm',
    scrapeType: 'html',
  },
  'levontin7': {
    id: 'levontin7',
    name: 'Levontin 7',
    url: 'https://levontin7.com',
    scrapeType: 'html',
  },
  'kuli-alma': {
    id: 'kuli-alma',
    name: 'Kuli Alma',
    url: 'https://www.facebook.com/kulialma/events',
    scrapeType: 'html',
  },
  'ozen-bar': {
    id: 'ozen-bar',
    name: 'Ozen Bar',
    url: 'https://ozen.co.il',
    scrapeType: 'html',
  },
  'suzanne-dellal': {
    id: 'suzanne-dellal',
    name: 'Suzanne Dellal',
    url: 'https://suzannedellal.org.il',
    scrapeType: 'html',
  },
  'secret-telaviv': {
    id: 'secret-telaviv',
    name: 'Secret Tel Aviv',
    url: 'https://secrettelaviv.com/events',
    scrapeType: 'html',
  },
  'go-out': {
    id: 'go-out',
    name: 'Go Out',
    url: 'https://go-out.co/tel-aviv',
    scrapeType: 'html',
  },
  'eventim': {
    id: 'eventim',
    name: 'Eventim',
    url: 'https://www.eventim.co.il/city/tel-aviv-146',
    scrapeType: 'html',
  },
  'ticketmaster': {
    id: 'ticketmaster',
    name: 'Ticketmaster IL',
    url: 'https://ticketmaster.co.il',
    scrapeType: 'html',
  },
  'artport': {
    id: 'artport',
    name: 'Artport Tel Aviv',
    url: 'https://artport.art',
    scrapeType: 'html',
  },
  'tlv-municipality': {
    id: 'tlv-municipality',
    name: 'TLV Municipality',
    url: 'https://tel-aviv.gov.il',
    scrapeType: 'html',
  },
};

// Scrape a venue using Firecrawl
const scrapeVenue = async (config: VenueConfig, apiKey: string): Promise<Event[]> => {
  console.log(`Scraping venue: ${config.name} (${config.url})`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: config.url,
        formats: ['markdown'],
        onlyMainContent: true,
        waitFor: 3000, // Wait for dynamic content
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl error for ${config.name}:`, errorText);
      return [];
    }

    const data = await response.json();
    const markdown = data.data?.markdown || data.markdown || '';
    
    if (!markdown) {
      console.log(`No content found for ${config.name}`);
      return [];
    }

    // Parse events from markdown content
    const events = parseEventsFromMarkdown(markdown, config);
    console.log(`Found ${events.length} events from ${config.name}`);
    
    return events;
  } catch (error) {
    console.error(`Error scraping ${config.name}:`, error);
    return [];
  }
};

// Parse events from scraped markdown content
const parseEventsFromMarkdown = (markdown: string, config: VenueConfig): Event[] => {
  const events: Event[] = [];
  const lines = markdown.split('\n');
  
  // Common date patterns in various formats
  const datePatterns = [
    /(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/g, // DD.MM.YYYY or DD/MM/YYYY
    /(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/g,   // YYYY-MM-DD
    /(\d{1,2})\s+(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/gi, // Hebrew dates
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/gi, // English dates
  ];

  // Hebrew month mapping
  const hebrewMonths: Record<string, number> = {
    'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
    'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
  };

  const englishMonths: Record<string, number> = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12,
  };

  // Time pattern
  const timePattern = /(\d{1,2}):(\d{2})/;

  let currentDate: string | null = null;
  let currentTitle: string | null = null;
  let eventCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Try to find dates in the line
    let foundDate = false;
    
    // Check DD.MM.YYYY pattern
    const dmyMatch = line.match(/(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      let year = parseInt(dmyMatch[3], 10);
      if (year < 100) year += 2000;
      currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      foundDate = true;
    }

    // Check YYYY-MM-DD pattern
    const ymdMatch = line.match(/(\d{4})[.\/\-](\d{1,2})[.\/\-](\d{1,2})/);
    if (ymdMatch && !foundDate) {
      currentDate = `${ymdMatch[1]}-${String(parseInt(ymdMatch[2])).padStart(2, '0')}-${String(parseInt(ymdMatch[3])).padStart(2, '0')}`;
      foundDate = true;
    }

    // Check Hebrew date pattern
    const hebrewMatch = line.match(/(\d{1,2})\s+(ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/i);
    if (hebrewMatch && !foundDate) {
      const day = parseInt(hebrewMatch[1], 10);
      const month = hebrewMonths[hebrewMatch[2]];
      const year = new Date().getFullYear();
      currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      foundDate = true;
    }

    // Check English date pattern
    const englishMatch = line.match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i);
    if (englishMatch && !foundDate) {
      const day = parseInt(englishMatch[1], 10);
      const month = englishMonths[englishMatch[2].toLowerCase()];
      const year = new Date().getFullYear();
      currentDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      foundDate = true;
    }

    // Look for event titles (usually headings or significant lines)
    // Lines with ## or ### are likely event titles
    if (line.startsWith('#')) {
      currentTitle = line.replace(/^#+\s*/, '').trim();
    } 
    // Lines that look like titles (not too long, no URLs, not just dates)
    else if (
      line.length > 3 && 
      line.length < 150 && 
      !line.startsWith('http') &&
      !line.match(/^\d+[.\/\-]\d+/) &&
      !line.match(/^[\d\s\-:]+$/) &&
      !line.toLowerCase().includes('cookie') &&
      !line.toLowerCase().includes('privacy') &&
      !line.toLowerCase().includes('terms')
    ) {
      // This might be an event title
      if (currentDate && !currentTitle) {
        currentTitle = line;
      } else if (!currentDate) {
        currentTitle = line;
      }
    }

    // Extract time if present
    const timeMatch = line.match(timePattern);
    const time = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : undefined;

    // If we have enough information, create an event
    if (currentTitle && currentDate) {
      // Filter to only include future events (next 30 days)
      const eventDate = new Date(currentDate);
      const now = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(now.getDate() + 30);
      
      if (eventDate >= now && eventDate <= thirtyDaysFromNow) {
        eventCounter++;
        events.push({
          id: `${config.id}-${currentDate}-${eventCounter}`,
          title: currentTitle,
          venue: config.name,
          venueId: config.id,
          date: currentDate,
          time: time,
          url: config.url,
          description: `Event at ${config.name}`,
        });
      }
      
      // Reset for next event
      currentTitle = null;
    }
  }

  // Deduplicate events by title + date
  const uniqueEvents = events.reduce((acc: Event[], event) => {
    const key = `${event.title}-${event.date}`;
    if (!acc.some(e => `${e.title}-${e.date}` === key)) {
      acc.push(event);
    }
    return acc;
  }, []);

  return uniqueEvents;
};

// Filter events based on brief preferences
const filterEventsForBrief = (
  events: Event[],
  brief: {
    venues: string[];
    genres: string[];
    artists: string[];
    schedule: { eventWindow: string };
  }
): Event[] => {
  const now = new Date();
  let endDate = new Date();

  // Determine date range based on event window
  switch (brief.schedule.eventWindow) {
    case 'This weekend':
      const dayOfWeek = now.getDay();
      const daysUntilSaturday = dayOfWeek === 0 ? 6 : 6 - dayOfWeek;
      endDate.setDate(now.getDate() + daysUntilSaturday + 1); // Include Sunday
      break;
    case 'Next 7 days':
      endDate.setDate(now.getDate() + 7);
      break;
    case 'Next 2 weeks':
      endDate.setDate(now.getDate() + 14);
      break;
    case 'This month':
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      break;
    default:
      endDate.setDate(now.getDate() + 7);
  }

  return events.filter(event => {
    const eventDate = new Date(event.date);
    
    // Check date range
    if (eventDate < now || eventDate > endDate) return false;

    // Venue filtering is already done at scrape time
    // But double-check if venues are specified
    if (brief.venues.length > 0 && !brief.venues.includes(event.venueId)) {
      return false;
    }

    return true;
  });
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brief } = await req.json();
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Scraping service not configured' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Determine which venues to scrape based on brief
    const venuesToScrape: VenueConfig[] = [];
    
    if (brief?.venues && brief.venues.length > 0) {
      // Only scrape specified venues
      for (const venueId of brief.venues) {
        if (VENUE_CONFIGS[venueId]) {
          venuesToScrape.push(VENUE_CONFIGS[venueId]);
        }
      }
    } else {
      // Scrape all venues if none specified
      venuesToScrape.push(...Object.values(VENUE_CONFIGS));
    }

    console.log(`Scraping ${venuesToScrape.length} venues: ${venuesToScrape.map(v => v.name).join(', ')}`);

    // Scrape venues in parallel (with concurrency limit to avoid rate limiting)
    const allEvents: Event[] = [];
    const CONCURRENCY_LIMIT = 3;
    
    for (let i = 0; i < venuesToScrape.length; i += CONCURRENCY_LIMIT) {
      const batch = venuesToScrape.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map(venue => scrapeVenue(venue, firecrawlApiKey))
      );
      
      for (const events of batchResults) {
        allEvents.push(...events);
      }
      
      // Small delay between batches to respect rate limits
      if (i + CONCURRENCY_LIMIT < venuesToScrape.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Filter events based on brief preferences
    const matchingEvents = brief 
      ? filterEventsForBrief(allEvents, brief)
      : allEvents;

    console.log(`Found ${matchingEvents.length} matching events from ${allEvents.length} total scraped events`);

    return new Response(
      JSON.stringify({ 
        events: matchingEvents,
        fetchedAt: new Date().toISOString(),
        totalEvents: allEvents.length,
        venuesScraped: venuesToScrape.map(v => v.name),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error fetching events:", errorMessage);
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
