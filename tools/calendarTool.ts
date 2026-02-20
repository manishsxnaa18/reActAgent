import { tool } from "@langchain/core/tools";
import chrono from "chrono-node";
import {
  getCalendarEvents,
  getEventsForDate,
  createCalendarEvent
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
