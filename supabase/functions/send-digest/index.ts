import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "resend";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trace-id",
};

const EDGE_FUNCTION_NAME = "send-digest";

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

interface Event {
  id: string;
  title: string;
  venue: string;
  date: string;
  time?: string;
  artists?: string[];
  genres?: string[];
  url?: string;
  description?: string;
}

interface DigestRequest {
  traceId?: string;
  deliveryMethod: 'whatsapp' | 'email';
  deliveryContact: string;
  briefName: string;
  events: Event[];
}

// Format events for WhatsApp message
const formatWhatsAppMessage = (briefName: string, events: Event[]): string => {
  if (events.length === 0) {
    return `📭 *${briefName}*\n\nNo matching events found for your preferences this time. We'll keep looking!`;
  }

  let message = `🎵 *${briefName}*\n\n`;
  message += `Found ${events.length} event${events.length > 1 ? 's' : ''} matching your preferences:\n\n`;

  events.slice(0, 10).forEach((event, index) => {
    message += `${index + 1}. *${event.title}*\n`;
    message += `   📍 ${event.venue}\n`;
    message += `   📅 ${event.date}${event.time ? ` at ${event.time}` : ''}\n`;
    if (event.genres && event.genres.length > 0) {
      message += `   🎸 ${event.genres.join(', ')}\n`;
    }
    if (event.url) {
      message += `   🔗 ${event.url}\n`;
    }
    message += '\n';
  });

  if (events.length > 10) {
    message += `\n... and ${events.length - 10} more events!`;
  }

  return message;
};

// Format events for email
const formatEmailHtml = (briefName: string, events: Event[]): string => {
  if (events.length === 0) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">📭 ${briefName}</h1>
        <p>No matching events found for your preferences this time. We'll keep looking!</p>
      </div>
    `;
  }

  const eventCards = events.slice(0, 15).map(event => `
    <div style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <h3 style="margin: 0 0 8px; color: #1e293b;">${event.title}</h3>
      <p style="margin: 4px 0; color: #64748b;">📍 ${event.venue}</p>
      <p style="margin: 4px 0; color: #64748b;">📅 ${event.date}${event.time ? ` at ${event.time}` : ''}</p>
      ${event.genres && event.genres.length > 0 
        ? `<p style="margin: 4px 0; color: #f97316;">🎸 ${event.genres.join(', ')}</p>` 
        : ''}
      ${event.url ? `<a href="${event.url}" style="color: #f97316; text-decoration: none;">View Details →</a>` : ''}
    </div>
  `).join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #f97316; margin-bottom: 4px;">🎵 ${briefName}</h1>
      <p style="color: #64748b; margin-top: 0;">Found ${events.length} event${events.length > 1 ? 's' : ''} matching your preferences</p>
      
      ${eventCards}
      
      ${events.length > 15 ? `<p style="color: #64748b; text-align: center;">... and ${events.length - 15} more events!</p>` : ''}
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        You're receiving this because you subscribed to Brief AI digests.<br>
        Manage your preferences in the app.
      </p>
    </div>
  `;
};

// Send WhatsApp message via Twilio
const sendWhatsApp = async (to: string, message: string, logger: ReturnType<typeof createLogger>): Promise<{ success: boolean; error?: string }> => {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: "Twilio credentials not configured" };
  }

  // Ensure phone numbers are in WhatsApp format
  const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const fromWhatsApp = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: fromWhatsApp,
          To: toWhatsApp,
          Body: message,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      logger.error("Twilio API error:", errorData);
      return { success: false, error: errorData.message || "Failed to send WhatsApp message" };
    }

    const data = await response.json();
    logger.log("WhatsApp message sent:", data.sid);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Error sending WhatsApp:", errorMessage);
    return { success: false, error: errorMessage };
  }
};

// Send email via Resend
const sendEmail = async (to: string, subject: string, html: string, logger: ReturnType<typeof createLogger>): Promise<{ success: boolean; error?: string }> => {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  if (!resendApiKey) {
    return { success: false, error: "Resend API key not configured" };
  }

  try {
    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: "Brief AI <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    });

    if (error) {
      logger.error("Resend API error:", error);
      return { success: false, error: error.message };
    }

    logger.log("Email sent successfully to:", to);
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error("Error sending email:", errorMessage);
    return { success: false, error: errorMessage };
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Get trace ID from header
  const headerTraceId = req.headers.get('X-Trace-Id');

  try {
    const { deliveryMethod, deliveryContact, briefName, events, traceId: bodyTraceId }: DigestRequest = await req.json();
    const traceId = headerTraceId || bodyTraceId;
    const logger = createLogger(traceId);

    logger.log(`Sending digest "${briefName}" via ${deliveryMethod} to ${deliveryContact}`);
    logger.log(`Events count: ${events.length}`);

    let result: { success: boolean; error?: string };

    if (deliveryMethod === 'whatsapp') {
      const message = formatWhatsAppMessage(briefName, events);
      logger.log('WhatsApp digest to send:', message);
      result = await sendWhatsApp(deliveryContact, message, logger);
    } else {
      const subject = `🎵 ${briefName}: ${events.length} new event${events.length !== 1 ? 's' : ''}`;
      const html = formatEmailHtml(briefName, events);
      logger.log('Email digest to send - Subject:', subject);
      logger.log('Email digest HTML:', html);
      result = await sendEmail(deliveryContact, subject, html, logger);
    }

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error, traceId }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        deliveryMethod,
        eventsCount: events.length,
        traceId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${EDGE_FUNCTION_NAME}] Error:`, errorMessage, { edge_function_name: EDGE_FUNCTION_NAME });
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
