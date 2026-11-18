/**
 * Google Calendar Tool
 * Allows the agent to read events from user's Google Calendar
 */
import "../loadEnv";
import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Initialize OAuth2 client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback"
);

const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly"
];

export const googleOAuthClient = oauth2Client;

/**
 * Set credentials for the OAuth2 client
 */
export function setCredentials(accessToken: string, refreshToken: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
}

export function getCalendarAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: CALENDAR_SCOPES
  });
}

export async function exchangeAuthCode(code: string): Promise<{ accessToken: string; refreshToken?: string }>{
  const { tokens } = await oauth2Client.getToken(code);
  if (tokens.access_token || tokens.refresh_token) {
    oauth2Client.setCredentials(tokens);
  }
  return {
    accessToken: tokens.access_token || "",
    refreshToken: tokens.refresh_token ?? undefined
  };
}

function isInvalidGrantError(error: any): boolean {
  console.log('isInvalidGrantError');
  const message = typeof error?.message === "string" ? error.message : "";
  const errorCode = error?.response?.data?.error || error?.response?.data?.error_description;
  return message.includes("invalid_grant") || String(errorCode).includes("invalid_grant");
}

function getCalendarReauthMessage(): string {
  const mode = (process.env.CALENDAR_REAUTH_MODE || "cli").toLowerCase();
  if (mode === "app") {
    return "Google Calendar authorization expired. Please re-authenticate in the app to continue.";
  }

  return `Google Calendar authorization expired. Re-auth required.\nOpen this URL and grant access:\n${getCalendarAuthUrl()}\n\nThen reply with: calendar_auth <code>`;
}

/**
 * Get upcoming events from user's Google Calendar
 */
export async function getCalendarEvents(
  maxResults: number = 10,
  timeMin?: string
): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const timeMinDate = timeMin || new Date().toISOString();

  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMinDate,
      maxResults: maxResults,
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    if (events.length === 0) {
      return "No upcoming events found.";
    }

    const formattedEvents = events
      .map((event) => {
        const start = event.start?.dateTime || event.start?.date || "TBD";
        const end = event.end?.dateTime || event.end?.date || "TBD";
        const summary = event.summary || "No title";
        const description = event.description || "";
        const location = event.location || "";

        return `Event: ${summary}
  Start: ${start}
  End: ${end}
  ${location ? `Location: ${location}` : ""}
  ${description ? `Description: ${description}` : ""}`;
      })
      .join("\n\n");

    return formattedEvents;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.error("Error fetching calendar events:", error);
    return "Error fetching calendar events. Please check your Google Calendar permissions.";
  }
}

/**
 * Search for events on a specific date
 */
export async function getEventsForDate(date: string): Promise<string> {
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // Set time range for the entire day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startOfDay.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items || [];

    if (events.length === 0) {
      return `No events found on ${date}.`;
    }

    const formattedEvents = events
      .map((event) => {
        const start = event.start?.dateTime || event.start?.date || "TBD";
        const end = event.end?.dateTime || event.end?.date || "TBD";
        const summary = event.summary || "No title";

        return `${start} - ${summary}`;
      })
      .join("\n");

    return formattedEvents;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.error("Error fetching events for date:", error);
    return "Error fetching events for the specified date.";
  }
}

/**
 * Create a new event in Google Calendar
 */
export async function createCalendarEvent(title: string, startTime: string, endTime: string,
  description?: string, location?: string): Promise<string> {
  console.log('createCalendarEvent input@1:', title);
  
  if (!title || !startTime || !endTime) {
    throw new Error("Missing required fields. Please provide title, startTime, and endTime.");
  }
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const event = {
    summary: title,
    description: description || "",
    location: location || "",
    start: {
      dateTime: startTime,
      timeZone: "UTC",
    },
    end: {
      dateTime: endTime,
      timeZone: "UTC",
    },
  };

  console.log({event})
  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    return `Event created successfully! 
Title: ${response.data.summary}
Link: ${response.data.htmlLink}`;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.log({error})
    console.error("Error creating calendar event:", error);
    return "Error creating calendar event. Please check your permissions.";
  }
}

type CalendarEvent = calendar_v3.Schema$Event;

function getCalendarClient() {
  return google.calendar({ version: "v3", auth: oauth2Client });
}

async function resolveEventByIdentifier(identifier: string): Promise<CalendarEvent | null> {
  const calendar = getCalendarClient();
  if (!identifier) {
    return null;
  }
  //console.log('resolveEventByIdentifier:identifier',{identifier});
  try {
    const direct = await calendar.events.get({ calendarId: "primary", eventId: identifier });
    if (direct.data) {
      return direct.data;
    }
  } catch (error: any) {
    //console.log('resolveEventByIdentifier:error',{error});
    if (error?.code !== 404) {
      console.warn("Error fetching event by ID:", error);
    }
  }
 console.log('resolveEventByIdentifier:after get events')
  const now = new Date();
  const pastWindow = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const futureWindow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const search = await calendar.events.list({
    calendarId: "primary",
    timeMin: pastWindow.toISOString(),
    timeMax: futureWindow.toISOString(),
    maxResults: 100,
    q: identifier,
    singleEvents: true,
    orderBy: "startTime"
  });
  //console.log('resolveEventByIdentifier:search results',{search})
  return search.data.items && search.data.items.length > 0 ? search.data.items[0] : null;
}

function formatEventSummary(event: CalendarEvent): string {
  const start = event.start?.dateTime || event.start?.date || "Unknown start";
  const title = event.summary || "Untitled event";
  return `${title} (${start})`;
}

export async function cancelCalendarEvent(
  eventIdentifier: string,
  notifyAttendees: boolean = true
): Promise<string> {
  try {
    const calendar = getCalendarClient();
    const event = await resolveEventByIdentifier(eventIdentifier);

    if (!event || !event.id) {
      return `Could not find an event matching "${eventIdentifier}".`;
    }

    await calendar.events.delete({
      calendarId: "primary",
      eventId: event.id,
      sendUpdates: notifyAttendees ? "all" : "none"
    });

    return `Cancelled event: ${formatEventSummary(event)}${notifyAttendees ? " and notified attendees." : "."}`;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.error("Error cancelling calendar event:", error);
    return "Error cancelling calendar event. Please check your permissions.";
  }
}

export async function addAttendeesToEvent(
  eventIdentifier: string,
  attendeeEmails: string[],
  notifyAttendees: boolean = true
): Promise<string> {
  if (!attendeeEmails || attendeeEmails.length === 0) {
    return "Please provide at least one attendee email.";
  }
  try {
    const calendar = getCalendarClient();
    const event = await resolveEventByIdentifier(eventIdentifier);

    console.log({event, eventIdentifier})

    if (!event || !event.id) {
      return `Could not find an event matching "${eventIdentifier}".`;
    }

    const existingAttendees = event.attendees || [];
    const newAttendees = attendeeEmails.map((email) => ({ email }));

    const mergedAttendees = [...existingAttendees];
    for (const attendee of newAttendees) {
      if (!mergedAttendees.some((existing) => existing.email === attendee.email)) {
        mergedAttendees.push(attendee);
      }
    }

    await calendar.events.patch({
      calendarId: "primary",
      eventId: event.id,
      requestBody: {
        attendees: mergedAttendees
      },
      sendUpdates: notifyAttendees ? "all" : "none"
    });

    return `Added attendees to ${formatEventSummary(event)}: ${attendeeEmails.join(", ")}${notifyAttendees ? " (notifications sent)." : "."}`;
  } catch (error) {
    console.log('addAttendee',{error})
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.error("Error adding attendees:", error);
    return "Error adding attendees. Please check your permissions.";
  }
}

export async function sendNotificationToAttendees(
  eventIdentifier: string,
  message: string,
  subject?: string
): Promise<string> {
  if (!message) {
    return "Notification message cannot be empty.";
  }
  try {
    const calendar = getCalendarClient();
    const event = await resolveEventByIdentifier(eventIdentifier);

    if (!event || !event.id) {
      return `Could not find an event matching "${eventIdentifier}".`;
    }

    const timestamp = new Date().toISOString();
    const appendedDescription = `${event.description || ""}\n\nNotification (${timestamp}${subject ? ` - ${subject}` : ""}):\n${message}`.trim();

    await calendar.events.patch({
      calendarId: "primary",
      eventId: event.id,
      requestBody: {
        description: appendedDescription
      },
      sendUpdates: "all"
    });

    return `Sent notification to attendees of ${formatEventSummary(event)}.`;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.error("Error sending notification:", error);
    return "Error sending notification. Please check your permissions.";
  }
}

export interface UpdateCalendarEventInput {
  eventIdentifier: string;
  title?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  attendeeEmails?: string[];
  notifyAttendees?: boolean;
}

export async function updateCalendarEventDetails(
  input: UpdateCalendarEventInput
): Promise<string> {
  const {
    eventIdentifier,
    title,
    startTime,
    endTime,
    location,
    description,
    attendeeEmails,
    notifyAttendees = true
  } = input;

  try {
    const calendar = getCalendarClient();
    const event = await resolveEventByIdentifier(eventIdentifier);

    if (!event || !event.id) {
      return `Could not find an event matching "${eventIdentifier}".`;
    }

    const requestBody: calendar_v3.Schema$Event = {};

    if (title) requestBody.summary = title;
    if (startTime) {
      requestBody.start = { dateTime: startTime, timeZone: "UTC" };
    }
    if (endTime) {
      requestBody.end = { dateTime: endTime, timeZone: "UTC" };
    }
    if (location) requestBody.location = location;
    if (description) requestBody.description = description;
    if (attendeeEmails && attendeeEmails.length > 0) {
      requestBody.attendees = attendeeEmails.map((email) => ({ email }));
    }

    if (Object.keys(requestBody).length === 0) {
      return "No updates were provided.";
    }

    await calendar.events.patch({
      calendarId: "primary",
      eventId: event.id,
      requestBody,
      sendUpdates: notifyAttendees ? "all" : "none"
    });

    return `Updated event: ${formatEventSummary(event)}.`;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      return getCalendarReauthMessage();
    }
    console.error("Error updating calendar event:", error);
    return "Error updating calendar event. Please check your permissions.";
  }
}

