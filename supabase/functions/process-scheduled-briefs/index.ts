import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  
  // Check if it's the right day and within a 30-minute window of the scheduled time
  // This accounts for cron running at :00 and :30
  if (schedule.dayOfWeek !== currentDay) {
    return false;
  }
  
  const scheduledTotalMinutes = scheduledHour * 60 + scheduledMinute;
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  // Send if we're within 30 minutes after the scheduled time
  // This ensures the brief is sent during the cron run closest to the scheduled time
  return currentTotalMinutes >= scheduledTotalMinutes && 
         currentTotalMinutes < scheduledTotalMinutes + 30;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log("Starting scheduled brief processing...");
    const processStart = new Date().toISOString();

    // Fetch all active briefs
    const { data: briefs, error: briefsError } = await supabase
      .from('briefs')
      .select('*')
      .eq('is_active', true);

    if (briefsError) {
      throw new Error(`Failed to fetch briefs: ${briefsError.message}`);
    }

    console.log(`Found ${briefs?.length || 0} active briefs`);

    const results: Array<{
      briefId: string;
      briefName: string;
      status: 'sent' | 'skipped' | 'error';
      reason?: string;
      eventsCount?: number;
    }> = [];

    // Process each brief
    for (const brief of (briefs as Brief[]) || []) {
      console.log(`Processing brief: ${brief.name} (${brief.id})`);

      // Check if this brief should be sent now based on schedule
      if (!shouldSendBrief(brief.schedule)) {
        console.log(`Skipping brief ${brief.name}: not scheduled for now`);
        results.push({
          briefId: brief.id,
          briefName: brief.name,
          status: 'skipped',
          reason: 'Not scheduled for current time',
        });
        continue;
      }

      try {
        // Step 1: Scrape events from venues
        console.log(`[${brief.name}] Step 1: Scraping venues...`);
        const fetchEventsResponse = await fetch(
          `${supabaseUrl}/functions/v1/fetch-events`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              brief: {
                venues: brief.venues,
                genres: brief.genres,
                artists: brief.artists,
                schedule: brief.schedule,
              },
            }),
          }
        );

        if (!fetchEventsResponse.ok) {
          const errorText = await fetchEventsResponse.text();
          throw new Error(`Failed to fetch events: ${errorText}`);
        }

        const scrapeResult = await fetchEventsResponse.json() as { events: Event[] };
        console.log(`[${brief.name}] Scraped ${scrapeResult.events.length} raw events`);

        // Step 2: Filter events using AI based on genres/artists
        console.log(`[${brief.name}] Step 2: AI filtering by genres [${(brief.genres || []).join(', ')}] and artists [${(brief.artists || []).join(', ')}]...`);
        const filterResponse = await fetch(
          `${supabaseUrl}/functions/v1/filter-events-ai`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              rawEvents: scrapeResult.events,
              genres: brief.genres || [],
              artists: brief.artists || [],
              briefName: brief.name,
            }),
          }
        );

        if (!filterResponse.ok) {
          const errorText = await filterResponse.text();
          console.error(`[${brief.name}] AI filter failed, using raw events: ${errorText}`);
          // Fallback to raw events if AI fails
        }

        let events: Event[];
        if (filterResponse.ok) {
          const filterResult = await filterResponse.json() as { events: Event[]; reasoning?: string };
          events = filterResult.events;
          console.log(`[${brief.name}] AI filtered to ${events.length} relevant events. Reasoning: ${filterResult.reasoning || 'N/A'}`);
        } else {
          // Fallback to raw events
          events = scrapeResult.events;
          console.log(`[${brief.name}] Using ${events.length} raw events (AI filter failed)`);
        }

        // Step 3: Send the digest with filtered events
        console.log(`[${brief.name}] Step 3: Sending digest...`);
        const sendDigestResponse = await fetch(
          `${supabaseUrl}/functions/v1/send-digest`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
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
        });

        console.log(`Successfully sent digest for brief ${brief.name}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing brief ${brief.name}:`, errorMessage);
        results.push({
          briefId: brief.id,
          briefName: brief.name,
          status: 'error',
          reason: errorMessage,
        });
      }
    }

    const summary = {
      processedAt: processStart,
      completedAt: new Date().toISOString(),
      totalBriefs: briefs?.length || 0,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      results,
    };

    console.log("Processing complete:", JSON.stringify(summary));

    return new Response(
      JSON.stringify(summary),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in process-scheduled-briefs:", errorMessage);
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
