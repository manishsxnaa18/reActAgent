"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEventTool = exports.notifyAttendeesTool = exports.addAttendeesTool = exports.cancelEventTool = exports.createEventTool = exports.getEventsForDateTool = exports.getUpcomingEventsTool = void 0;
const tools_1 = require("@langchain/core/tools");
const chrono_node_1 = __importDefault(require("chrono-node"));
const googleCalendar_1 = require("../tools/googleCalendar");
const zod_1 = require("zod");
const createEventSchema = zod_1.z.object({
    title: zod_1.z.string(),
    startTime: zod_1.z.string(),
    endTime: zod_1.z.string(),
    description: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
});
const eventIdentifierSchema = zod_1.z.object({
    eventIdentifier: zod_1.z.string().describe("Google Calendar event ID or a keyword to search for the event"),
    notifyAttendees: zod_1.z.boolean().optional()
});
const addAttendeesSchema = zod_1.z.object({
    eventIdentifier: zod_1.z.string(),
    attendeeEmails: zod_1.z.array(zod_1.z.string().email()).min(1),
    notifyAttendees: zod_1.z.boolean().optional()
});
const notifyAttendeesSchema = zod_1.z.object({
    eventIdentifier: zod_1.z.string(),
    message: zod_1.z.string(),
    subject: zod_1.z.string().optional()
});
const updateEventSchema = zod_1.z.object({
    eventIdentifier: zod_1.z.string(),
    title: zod_1.z.string().optional(),
    startTime: zod_1.z.string().optional(),
    endTime: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    attendeeEmails: zod_1.z.array(zod_1.z.string().email()).optional(),
    notifyAttendees: zod_1.z.boolean().optional()
});
exports.getUpcomingEventsTool = (0, tools_1.tool)(async () => {
    return await (0, googleCalendar_1.getCalendarEvents)(10);
}, {
    name: "get_upcoming_events",
    description: "Get upcoming events from user's Google Calendar"
});
exports.getEventsForDateTool = (0, tools_1.tool)(async (input) => {
    const parsed = chrono_node_1.default.parseDate(input);
    if (!parsed)
        return "Could not understand the date.";
    return await (0, googleCalendar_1.getEventsForDate)(parsed.toISOString());
}, {
    name: "get_events_for_date",
    description: "Get calendar events for a specific date. Input should contain natural language date like 'tomorrow', 'next Monday'."
});
exports.createEventTool = (0, tools_1.tool)(async (input) => {
    console.log("createEventTool input@2:", input);
    const { title, startTime, endTime, description, location } = input || {};
    return await (0, googleCalendar_1.createCalendarEvent)(title, startTime, endTime, description, location);
}, {
    name: "create_calendar_event",
    description: "Create a calendar event. Requires title, startTime (ISO), endTime (ISO).",
    schema: createEventSchema
});
exports.cancelEventTool = (0, tools_1.tool)(async (input) => {
    return await (0, googleCalendar_1.cancelCalendarEvent)(input.eventIdentifier, input.notifyAttendees ?? true);
}, {
    name: "cancel_calendar_event",
    description: "Cancel an existing calendar event using its ID or keywords. Optionally notify attendees.",
    schema: eventIdentifierSchema
});
exports.addAttendeesTool = (0, tools_1.tool)(async (input) => {
    return await (0, googleCalendar_1.addAttendeesToEvent)(input.eventIdentifier, input.attendeeEmails, input.notifyAttendees ?? true);
}, {
    name: "add_attendees_to_event",
    description: "Add one or more attendees to an existing calendar event and optionally notify them.",
    schema: addAttendeesSchema
});
exports.notifyAttendeesTool = (0, tools_1.tool)(async (input) => {
    return await (0, googleCalendar_1.sendNotificationToAttendees)(input.eventIdentifier, input.message, input.subject);
}, {
    name: "notify_event_attendees",
    description: "Send an email notification to all attendees of an event with an optional subject line.",
    schema: notifyAttendeesSchema
});
exports.updateEventTool = (0, tools_1.tool)(async (input) => {
    return await (0, googleCalendar_1.updateCalendarEventDetails)(input);
}, {
    name: "update_calendar_event",
    description: "Update calendar event fields like date/time, title, location, description, or attendees.",
    schema: updateEventSchema
});
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
