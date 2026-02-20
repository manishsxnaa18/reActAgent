import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { AgentState } from "./state";
import { SystemMessage, ToolMessage, BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

const SYSTEM_PROMPT = `
You are a professional AI assistant.

IMPORTANT: Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.

Rules:
- Use tools when needed for calendar or web queries.
- Use natural language date interpretation carefully.
- Do not hallucinate calendar events.
- If unsure, ask clarification.
- Keep answers clear and structured.
- Always use the current date provided above when answering date-related questions.
`;

import {
  getUpcomingEventsTool,
  getEventsForDateTool,
  createEventTool
} from "../tools/calendarTool";

import { webSearchTool } from "../tools/searchTool";

const tools = [
  getUpcomingEventsTool,
  getEventsForDateTool,
  createEventTool,
  webSearchTool
];

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0
}).bindTools(tools);

async function executeAgentLoop(state: typeof AgentState.State): Promise<{ messages: BaseMessage[] }> {
  const messages = state.messages;

  // Ensure system message is first
  const hasSystemMessage = messages[0]?._getType() === "system";
  const messagesWithSystem: BaseMessage[] = hasSystemMessage
    ? messages
    : [new SystemMessage(SYSTEM_PROMPT), ...messages];

  // Call the LLM
  let response = await llm.invoke(messagesWithSystem);
  const newMessages: BaseMessage[] = [response];

  console.log('Initial LLM response:', response);

  // Process tool calls in a loop
  while ("tool_calls" in response && response.tool_calls && response.tool_calls.length > 0) {
    const toolCalls = response.tool_calls as Array<{ name: string; args: any; id: string }>;
    const toolResults: ToolMessage[] = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.name;
      const toolInput = toolCall.args;
      let resultStr: string;

      try {
        if (toolName === "get_upcoming_events") {
          const res = await getUpcomingEventsTool.invoke({});
          resultStr = typeof res === "string" ? res : JSON.stringify(res);
        } else if (toolName === "get_events_for_date") {
          const res = await getEventsForDateTool.invoke(toolInput.input || toolInput);
          resultStr = typeof res === "string" ? res : JSON.stringify(res);
        } else if (toolName === "create_calendar_event") {
          let createEventToolInput = {};
          Object.assign(createEventToolInput, toolInput?.input || toolInput);
          console.log('createEventToolInput', createEventToolInput);
          const res = await createEventTool.invoke(createEventToolInput);
          resultStr = typeof res === "string" ? res : JSON.stringify(res);
        } else if (toolName === "web_search") {
          const res = await webSearchTool.invoke(toolInput.query || toolInput);
          resultStr = typeof res === "string" ? res : JSON.stringify(res);
        } else {
          resultStr = "Unknown tool";
        }
        console.log('resultStr', resultStr);
      } catch (error) {
        resultStr = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
      }

      toolResults.push(
        new ToolMessage({
          content: resultStr,
          tool_call_id: toolCall.id
        })
      );
    }

    newMessages.push(...toolResults);

    // Call LLM again with tool results
    response = await llm.invoke([...messagesWithSystem, ...newMessages]);
    newMessages.push(response);
  }

  return { messages: newMessages };
}

async function testCreateEventTool() {
  const createEventToolInput = {
  
    title: 'my first event from AI',
    startTime: '2026-02-22T10:00:00',
    endTime: '2026-02-22T15:00:00'
  
};
  
  console.log('createEventToolInput', createEventToolInput);
  const res = await createEventTool.invoke(createEventToolInput); 
  console.log('res', res);
  
}

const builder = new StateGraph(AgentState) as any;

builder.addNode("agent", executeAgentLoop);
builder.setEntryPoint("agent");
builder.setFinishPoint("agent");

export const memory = new MemorySaver();

export const graph = builder.compile({
  checkpointer: memory
});
