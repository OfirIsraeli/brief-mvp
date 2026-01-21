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

// Simulated event data - in production, this would scrape actual venue websites
const generateMockEvents = (): Event[] => {
  const venues = [
    { id: 'barby', name: 'Barby' },
    { id: 'teder', name: 'Teder.fm' },
    { id: 'levontin7', name: 'Levontin 7' },
    { id: 'kuli-alma', name: 'Kuli Alma' },
    { id: 'ozen-bar', name: 'Ozen Bar' },
    { id: 'suzanne-dellal', name: 'Suzanne Dellal' },
  ];

  const genres = ['Indie Rock', 'Jazz', 'Electronic', 'Hip Hop', 'Alternative', 'Folk', 'World Music'];
  const artists = [
    'The Midnight Howlers', 'Luna Eclipse', 'Desert Storm', 'Neon Dreams',
    'Electric Pulse', 'Velvet Thunder', 'Cosmic Drift', 'Urban Flow',
    'Sunset Boulevard', 'Northern Lights', 'Echo Valley', 'Rhythm Section'
  ];

  const events: Event[] = [];
  const now = new Date();

  // Generate events for the next 14 days
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const eventDate = new Date(now);
    eventDate.setDate(now.getDate() + dayOffset);

    // 2-4 events per day
    const eventsPerDay = Math.floor(Math.random() * 3) + 2;

    for (let i = 0; i < eventsPerDay; i++) {
      const venue = venues[Math.floor(Math.random() * venues.length)];
      const artist = artists[Math.floor(Math.random() * artists.length)];
      const genre = genres[Math.floor(Math.random() * genres.length)];
      const hour = 19 + Math.floor(Math.random() * 4); // 19:00 - 22:00

      events.push({
        id: `${venue.id}-${eventDate.toISOString().split('T')[0]}-${i}`,
        title: `${artist} Live`,
        venue: venue.name,
        venueId: venue.id,
        date: eventDate.toISOString().split('T')[0],
        time: `${hour}:00`,
        artists: [artist],
        genres: [genre],
        url: `https://example.com/events/${venue.id}/${eventDate.toISOString().split('T')[0]}`,
        description: `Join us for an amazing night with ${artist} at ${venue.name}!`,
      });
    }
  }

  return events;
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

    // Check venue match (if venues specified)
    if (brief.venues.length > 0 && !brief.venues.includes(event.venueId)) {
      return false;
    }

    // Check genre match (if genres specified)
    if (brief.genres.length > 0 && event.genres) {
      const hasMatchingGenre = event.genres.some(g => brief.genres.includes(g));
      if (!hasMatchingGenre) return false;
    }

    // Check artist match (if artists specified)
    if (brief.artists.length > 0 && event.artists) {
      const hasMatchingArtist = event.artists.some(a => 
        brief.artists.some(ba => a.toLowerCase().includes(ba.toLowerCase()))
      );
      if (!hasMatchingArtist) return false;
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

    // Fetch all events (in production, this would scrape venue websites)
    const allEvents = generateMockEvents();

    // Filter events based on brief preferences
    const matchingEvents = brief 
      ? filterEventsForBrief(allEvents, brief)
      : allEvents;

    console.log(`Found ${matchingEvents.length} matching events for brief`);

    return new Response(
      JSON.stringify({ 
        events: matchingEvents,
        fetchedAt: new Date().toISOString(),
        totalEvents: allEvents.length,
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
