import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { AgentState } from "./state";
import { SystemMessage, ToolMessage, BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

const SYSTEM_PROMPT = `
You are a professional AI assistant with access to multiple specialized tools.

IMPORTANT: Today's date is ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.

TOOL SELECTION GUIDE:

1. **query_company_knowledge** - Use for company-specific information:
   - Company policies, procedures, guidelines
   - Financial data (balance sheets, P&L, revenue)
   - Internal documentation
   - Product specifications from company docs
   - Organizational information

2. **web_search** - Use for current/public information:
   - Recent news and events
   - Public information not in company docs
   - Real-time data (stock prices, weather)
   - General facts and research

3. **Calendar tools** - Use for scheduling:
   - get_upcoming_events: List user's upcoming calendar events
   - get_events_for_date: Check events on specific date
   - create_calendar_event: Schedule new events

Rules:
- ALWAYS check company knowledge base FIRST for company-related questions
- Use web search for current events and public information
- Use natural language date interpretation carefully
- Do not hallucinate information - use tools to get facts
- If unsure which tool, prefer company knowledge base for internal questions
- Keep answers clear, structured, and cite sources when possible
`;

import {
  getUpcomingEventsTool,
  getEventsForDateTool,
  createEventTool
} from "../tools/calendarTool";

import { webSearchTool } from "../tools/searchTool";
import { knowledgeBaseTool } from "../tools/knowledgeBaseTool";
import { ingestionService } from "../rag/ingestionService";

const tools = [
  knowledgeBaseTool,        // Company knowledge base (RAG)
  getUpcomingEventsTool,    // Calendar tools
  getEventsForDateTool,
  createEventTool,
  webSearchTool             // Web search
];

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL || "gpt-4o",
  temperature: 0
}).bindTools(tools);

async function executeAgentLoop(state: typeof AgentState.State): Promise<{ messages: BaseMessage[] }> {
  const messages = state.messages;

  // Ensure system message is first
  const hasSystemMessage = messages[0]?._getType() === "system";
  const messagesWithSystem: BaseMessage[] = hasSystemMessage
    ? messages
    : [new SystemMessage(SYSTEM_PROMPT), ...messages];

  // Pre-retrieve company context to improve recall for internal docs
  const lastHumanMessage = [...messagesWithSystem]
    .reverse()
    .find((m) => m._getType && m._getType() === "human") as HumanMessage | undefined;

  let messagesWithContext = messagesWithSystem;
  if (lastHumanMessage && typeof lastHumanMessage.content === "string") {
    try {
      const context = await ingestionService.query(lastHumanMessage.content, 5);
      if (context && !context.includes("No relevant information found")) {
        messagesWithContext = [
          new SystemMessage(`Company knowledge base context:\n\n${context}`),
          ...messagesWithSystem
        ];
      }
    } catch (error) {
      console.error("Error pre-retrieving company context:", error);
    }
  }

  // Call the LLM
  let response = await llm.invoke(messagesWithContext);
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
        if (toolName === "query_company_knowledge") {
          const res = await knowledgeBaseTool.invoke(toolInput);
          resultStr = typeof res === "string" ? res : JSON.stringify(res);
        } else if (toolName === "get_upcoming_events") {
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
    response = await llm.invoke([...messagesWithContext, ...newMessages]);
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
