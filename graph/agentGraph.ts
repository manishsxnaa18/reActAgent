import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MemorySaver } from "@langchain/langgraph";
import { AgentState } from "./state";
import { SystemMessage, ToolMessage, BaseMessage, HumanMessage, AIMessage } from "@langchain/core/messages";

const AGENT_NAME = process.env.AGENT_NAME || "Meera";

const SYSTEM_PROMPT = `
You are ${AGENT_NAME}, a proactive executive AI assistant with access to multiple specialized tools.

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

3. **Calendar tools** - Use for scheduling and event management:
  - get_upcoming_events: List user's upcoming calendar events
  - get_events_for_date: Check events on specific date
  - create_calendar_event: Schedule new events
  - cancel_calendar_event: Cancel an event (notify attendees if asked)
  - add_attendees_to_event: Add guests to existing events
  - notify_event_attendees: Send updates/notifications to guests
  - update_calendar_event: Modify time, location, description, or attendees

4. **Jira tools** - Track engineering work:
  - create_jira_issue: Open tickets with ownership and metadata
  - update_jira_issue: Update issue fields
  - list_jira_issues: List issues by user/status/sprint
  - list_jira_issues_all: List issues for all users by status/sprint
  - jira_issue_counts: Count issues by user/status

Rules:
- ALWAYS check company knowledge base FIRST for company-related questions
- Use web search for current events and public information
- Use natural language date interpretation carefully
- Do not hallucinate information - use tools to get facts
- If unsure which tool, prefer company knowledge base for internal questions
- Keep answers clear, structured, and cite sources when possible
- Always refer to yourself as ${AGENT_NAME} when introducing yourself or clarifying your abilities.
`;

import {
  getUpcomingEventsTool,
  getEventsForDateTool,
  createEventTool,
  cancelEventTool,
  addAttendeesTool,
  notifyAttendeesTool,
  updateEventTool
} from "../tools/calendarTool";

import { webSearchTool } from "../tools/searchTool";
import { knowledgeBaseTool } from "../tools/knowledgeBaseTool";
import { ingestionService } from "../rag/ingestionService";
import { createJiraIssueTool, updateJiraIssueTool, listJiraIssuesTool, listJiraIssuesAllTool, jiraIssueCountsTool } from "../tools/jiraTool";

const tools = [
  knowledgeBaseTool,        // Company knowledge base (RAG)
  createJiraIssueTool,
  updateJiraIssueTool,
  listJiraIssuesTool,
  listJiraIssuesAllTool,
  jiraIssueCountsTool,
  getUpcomingEventsTool,    // Calendar tools
  getEventsForDateTool,
  createEventTool,
  cancelEventTool,
  addAttendeesTool,
  notifyAttendeesTool,
  updateEventTool,
  webSearchTool             // Web search
];

const llm = new ChatOpenAI({
  model: process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || "gpt-5-mini",
  temperature: 0
}).bindTools(tools);

async function buildMessagesWithContext(messages: BaseMessage[]): Promise<BaseMessage[]> {
  const nonSystemMessages = messages.filter((msg) => msg._getType?.() !== "system");
  const orderedMessages: BaseMessage[] = [new SystemMessage(SYSTEM_PROMPT), ...nonSystemMessages];

  const lastHumanMessage = [...nonSystemMessages]
    .reverse()
    .find((msg) => msg._getType?.() === "human") as HumanMessage | undefined;

  if (lastHumanMessage && typeof lastHumanMessage.content === "string" && lastHumanMessage.content.trim()) {
    try {
      const context = await ingestionService.query(lastHumanMessage.content, 5);
      if (context && !context.includes("No relevant information found")) {
        orderedMessages.splice(1, 0, new SystemMessage(`Company knowledge base context:\n\n${context}`));
      }
    } catch (error) {
      console.error("Error retrieving company context:", error);
    }
  }

  return orderedMessages;
}

async function callLLMNode(state: typeof AgentState.State): Promise<{ messages: BaseMessage[] }> {
  const llmMessages = await buildMessagesWithContext(state.messages);
  const response = await llm.invoke(llmMessages);
  console.log('LLM response:', response);
  return { messages: [response] };
}

async function toolExecutorNode(state: typeof AgentState.State): Promise<{ messages: BaseMessage[] }> {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage | undefined;

  if (!lastMessage || !("tool_calls" in lastMessage) || !lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return { messages: [] };
  }

  const toolCalls = lastMessage.tool_calls as Array<{ name: string; args: any; id: string }>;
  const toolResults: ToolMessage[] = [];
  console.log('toolCalls');
  for (const toolCall of toolCalls) {
    const toolName = toolCall.name;
    const toolInput = toolCall.args;
    let resultStr = "";

    try {
      if (toolName === "query_company_knowledge") {
        const res = await knowledgeBaseTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "create_jira_issue") {
        const res = await createJiraIssueTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "update_jira_issue") {
        const res = await updateJiraIssueTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "list_jira_issues") {
        const res = await listJiraIssuesTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "list_jira_issues_all") {
        const res = await listJiraIssuesAllTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "jira_issue_counts") {
        const res = await jiraIssueCountsTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "get_upcoming_events") {
        const res = await getUpcomingEventsTool.invoke({});
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "get_events_for_date") {
        const res = await getEventsForDateTool.invoke(toolInput.input || toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "create_calendar_event") {
        const createEventToolInput = { ...(toolInput?.input || toolInput) };
        console.log('createEventToolInput', createEventToolInput);
        const res = await createEventTool.invoke(createEventToolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "cancel_calendar_event") {
        const res = await cancelEventTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "add_attendees_to_event") {
        const res = await addAttendeesTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "notify_event_attendees") {
        const res = await notifyAttendeesTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "update_calendar_event") {
        const res = await updateEventTool.invoke(toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else if (toolName === "web_search") {
        const res = await webSearchTool.invoke(toolInput.query || toolInput);
        resultStr = typeof res === "string" ? res : JSON.stringify(res);
      } else {
        resultStr = "Unknown tool";
      }
      //console.log('resultStr', resultStr);
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

  return { messages: toolResults };
}

function shouldContinue(state: typeof AgentState.State): "tools" | "end" {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage | undefined;
console.log('lastMessage', lastMessage);
  if (lastMessage && "tool_calls" in lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
    return "tools";
  }

  return "end";
}

const builder = new StateGraph(AgentState) as any;

builder.addNode("call_llm", callLLMNode);
builder.addNode("tool_executor", toolExecutorNode);

builder.addConditionalEdges("call_llm", shouldContinue, {
  tools: "tool_executor",
  end: "__end__"
});

builder.addEdge("tool_executor", "call_llm");
builder.setEntryPoint("call_llm");

export const memory = new MemorySaver();

export const graph = builder.compile({
  checkpointer: memory
});
