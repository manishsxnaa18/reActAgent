/**
 * Google Calendar Tool
 * Allows the agent to read events from user's Google Calendar
 */
import "dotenv/config";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

// Initialize OAuth2 client
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback"
);

/**
 * Set credentials for the OAuth2 client
 */
export function setCredentials(accessToken: string, refreshToken: string) {
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
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
    console.log({error})
    console.error("Error creating calendar event:", error);
    return "Error creating calendar event. Please check your permissions.";
  }
}

