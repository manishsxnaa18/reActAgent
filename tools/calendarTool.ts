import { tool } from "@langchain/core/tools";
import chrono from "chrono-node";
import {
  getCalendarEvents,
  getEventsForDate,
  createCalendarEvent,
  cancelCalendarEvent,
  addAttendeesToEvent,
  sendNotificationToAttendees,
  updateCalendarEventDetails
} from "../tools/googleCalendar";

import { z } from "zod";

const createEventSchema = z.object({
  title: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
});

type CreateEventInput = z.infer<typeof createEventSchema>;

const eventIdentifierSchema = z.object({
  eventIdentifier: z.string().describe("Google Calendar event ID or a keyword to search for the event"),
  notifyAttendees: z.boolean().optional()
});

const addAttendeesSchema = z.object({
  eventIdentifier: z.string(),
  attendeeEmails: z.array(z.string().email()).min(1),
  notifyAttendees: z.boolean().optional()
});

const notifyAttendeesSchema = z.object({
  eventIdentifier: z.string(),
  message: z.string(),
  subject: z.string().optional()
});

const updateEventSchema = z.object({
  eventIdentifier: z.string(),
  title: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  attendeeEmails: z.array(z.string().email()).optional(),
  notifyAttendees: z.boolean().optional()
});

export const getUpcomingEventsTool = tool(
  async () => {
    return await getCalendarEvents(10);
  },
  {
    name: "get_upcoming_events",
    description: "Get upcoming events from user's Google Calendar"
  }
);

export const getEventsForDateTool = tool(
  async (input: string) => {
    const parsed = chrono.parseDate(input);
    if (!parsed) return "Could not understand the date.";

    return await getEventsForDate(parsed.toISOString());
  },
  {
    name: "get_events_for_date",
    description:
      "Get calendar events for a specific date. Input should contain natural language date like 'tomorrow', 'next Monday'."
  }
);

export const createEventTool = tool(
  async (input: CreateEventInput) => {
    console.log("createEventTool input@2:", input);
    const { title, startTime, endTime, description, location } = input || {};
  
    return await createCalendarEvent(title, startTime, endTime, description, location);
  },
  {
    name: "create_calendar_event",
    description:
      "Create a calendar event. Requires title, startTime (ISO), endTime (ISO).",
    schema: createEventSchema as any
  }
);

export const cancelEventTool = tool(
  async (input: z.infer<typeof eventIdentifierSchema>) => {
    return await cancelCalendarEvent(input.eventIdentifier, input.notifyAttendees ?? true);
  },
  {
    name: "cancel_calendar_event",
    description: "Cancel an existing calendar event using its ID or keywords. Optionally notify attendees.",
    schema: eventIdentifierSchema as any
  }
);

export const addAttendeesTool = tool(
  async (input: z.infer<typeof addAttendeesSchema>) => {
    return await addAttendeesToEvent(
      input.eventIdentifier,
      input.attendeeEmails,
      input.notifyAttendees ?? true
    );
  },
  {
    name: "add_attendees_to_event",
    description: "Add one or more attendees to an existing calendar event and optionally notify them.",
    schema: addAttendeesSchema as any
  }
);

export const notifyAttendeesTool = tool(
  async (input: z.infer<typeof notifyAttendeesSchema>) => {
    return await sendNotificationToAttendees(input.eventIdentifier, input.message, input.subject);
  },
  {
    name: "notify_event_attendees",
    description: "Send an email notification to all attendees of an event with an optional subject line.",
    schema: notifyAttendeesSchema as any
  }
);

export const updateEventTool = tool(
  async (input: z.infer<typeof updateEventSchema>) => {
    return await updateCalendarEventDetails(input);
  },
  {
    name: "update_calendar_event",
    description: "Update calendar event fields like date/time, title, location, description, or attendees.",
    schema: updateEventSchema as any
  }
);

// export const createEventTool = tool(
//   async (input: CreateEventInput) => {
//     console.log("createEventTool input@2:", input);
//     return await createCalendarEvent(input);
//   },
//   {
//     name: "create_calendar_event",
//     description: "Create a calendar event",
//     schema: createEventSchema,
//   }
// );
