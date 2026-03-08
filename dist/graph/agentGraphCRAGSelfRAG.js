"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.graph = exports.memory = void 0;
const openai_1 = require("@langchain/openai");
const langgraph_1 = require("@langchain/langgraph");
const state_1 = require("./state");
const messages_1 = require("@langchain/core/messages");
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
- If the user asks multiple questions in one message, answer ALL of them. Use a numbered list matching each question.
`;
const calendarTool_1 = require("../tools/calendarTool");
const searchTool_1 = require("../tools/searchTool");
const knowledgeBaseTool_1 = require("../tools/knowledgeBaseTool");
const ingestionService_1 = require("../rag/ingestionService");
const jiraTool_1 = require("../tools/jiraTool");
const googleCalendar_1 = require("../tools/googleCalendar");
const tools = [
    knowledgeBaseTool_1.knowledgeBaseTool, // Company knowledge base (RAG)
    jiraTool_1.createJiraIssueTool,
    jiraTool_1.updateJiraIssueTool,
    jiraTool_1.listJiraIssuesTool,
    jiraTool_1.listJiraIssuesAllTool,
    jiraTool_1.jiraIssueCountsTool,
    calendarTool_1.getUpcomingEventsTool, // Calendar tools
    calendarTool_1.getEventsForDateTool,
    calendarTool_1.createEventTool,
    calendarTool_1.cancelEventTool,
    calendarTool_1.addAttendeesTool,
    calendarTool_1.notifyAttendeesTool,
    calendarTool_1.updateEventTool,
    searchTool_1.webSearchTool // Web search
];
const llm = new openai_1.ChatOpenAI({
    model: process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || "gpt-5-mini",
    temperature: 0
}).bindTools(tools);
const evaluatorLlm = new openai_1.ChatOpenAI({
    model: process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || "gpt-5-mini",
    temperature: 0
});
async function decideRetrieval(question) {
    const decisionPrompt = `
Decide if the question needs company knowledge base retrieval.
Return only one word: retrieve or skip.

Question: ${question}
`;
    const response = await evaluatorLlm.invoke([new messages_1.SystemMessage(decisionPrompt)]);
    const content = typeof response.content === "string" ? response.content.trim().toLowerCase() : "";
    return content.includes("retrieve") ? "retrieve" : "skip";
}
async function evaluateContext(question, context) {
    const evalPrompt = `
You are verifying retrieved company context.
Return only one word: good or bad.

Question: ${question}

Context:
${context}
`;
    const response = await evaluatorLlm.invoke([new messages_1.SystemMessage(evalPrompt)]);
    const content = typeof response.content === "string" ? response.content.trim().toLowerCase() : "";
    return content.includes("good") ? "good" : "bad";
}
async function rewriteQuery(question) {
    const rewritePrompt = `
Rewrite the question for better company knowledge base retrieval.
Return only the rewritten query without quotes.

Question: ${question}
`;
    const response = await evaluatorLlm.invoke([new messages_1.SystemMessage(rewritePrompt)]);
    return typeof response.content === "string" && response.content.trim()
        ? response.content.trim()
        : question;
}
async function buildMessagesWithContext(messages) {
    const nonSystemMessages = messages.filter((msg) => msg._getType?.() !== "system");
    const orderedMessages = [new messages_1.SystemMessage(SYSTEM_PROMPT), ...nonSystemMessages];
    const lastHumanMessage = [...nonSystemMessages]
        .reverse()
        .find((msg) => msg._getType?.() === "human");
    if (lastHumanMessage && typeof lastHumanMessage.content === "string" && lastHumanMessage.content.trim()) {
        const question = lastHumanMessage.content.trim();
        try {
            const decision = await decideRetrieval(question);
            if (decision === "retrieve") {
                const initialContext = await ingestionService_1.ingestionService.query(question, 5);
                const hasContext = initialContext && !initialContext.includes("No relevant information found");
                if (hasContext) {
                    const verdict = await evaluateContext(question, initialContext);
                    if (verdict === "good") {
                        orderedMessages.splice(1, 0, new messages_1.SystemMessage(`Company knowledge base context:\n\n${initialContext}`));
                    }
                    else {
                        const rewritten = await rewriteQuery(question);
                        const retryContext = await ingestionService_1.ingestionService.query(rewritten, 5);
                        if (retryContext && !retryContext.includes("No relevant information found")) {
                            const retryVerdict = await evaluateContext(question, retryContext);
                            if (retryVerdict === "good") {
                                orderedMessages.splice(1, 0, new messages_1.SystemMessage(`Company knowledge base context:\n\n${retryContext}`));
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error("Error retrieving company context:", error);
        }
    }
    return orderedMessages;
}
function getLastHumanMessage(messages) {
    return [...messages].reverse().find((msg) => msg._getType?.() === "human");
}
function parseApproval(text) {
    const normalized = text.trim().toLowerCase();
    if (normalized.startsWith("approve"))
        return "approve";
    if (normalized.startsWith("reject"))
        return "reject";
    return null;
}
function parseCalendarAuthCode(text) {
    const trimmed = text.trim();
    if (trimmed.toLowerCase().startsWith("calendar_auth ")) {
        return trimmed.slice("calendar_auth ".length).trim() || null;
    }
    if (trimmed.toLowerCase().startsWith("calendar auth ")) {
        return trimmed.slice("calendar auth ".length).trim() || null;
    }
    return null;
}
async function callLLMNode(state) {
    const lastHumanMessage = getLastHumanMessage(state.messages);
    const approval = lastHumanMessage && typeof lastHumanMessage.content === "string"
        ? parseApproval(lastHumanMessage.content)
        : null;
    const calendarAuthCode = lastHumanMessage && typeof lastHumanMessage.content === "string"
        ? parseCalendarAuthCode(lastHumanMessage.content)
        : null;
    if (state.pendingToolCalls && state.pendingToolCalls.length > 0) {
        if (calendarAuthCode) {
            try {
                const tokens = await (0, googleCalendar_1.exchangeAuthCode)(calendarAuthCode);
                if (tokens.accessToken) {
                    (0, googleCalendar_1.setCredentials)(tokens.accessToken, tokens.refreshToken || "");
                }
                return {
                    messages: [new messages_1.AIMessage({ content: "Calendar re-auth successful. Retrying the last request now." })],
                    pendingToolCalls: state.pendingToolCalls
                };
            }
            catch (error) {
                return {
                    messages: [new messages_1.AIMessage({ content: "Calendar re-auth failed. Please try again with a fresh auth code." })],
                    pendingToolCalls: state.pendingToolCalls
                };
            }
        }
        const lastMessage = state.messages[state.messages.length - 1];
        if (lastMessage && lastMessage._getType?.() === "tool" && typeof lastMessage.content === "string") {
            if (lastMessage.content.includes("calendar_auth")) {
                return {
                    messages: [new messages_1.AIMessage({ content: lastMessage.content })],
                    pendingToolCalls: state.pendingToolCalls
                };
            }
        }
        if (approval === "approve") {
            return { messages: [] };
        }
        if (approval === "reject") {
            return {
                messages: [new messages_1.AIMessage({ content: "Approval rejected. No actions were taken." })],
                pendingToolCalls: null
            };
        }
    }
    const llmMessages = await buildMessagesWithContext(state.messages);
    const response = await llm.invoke(llmMessages);
    console.log("LLM response:", response);
    const toolCalls = ("tool_calls" in response && response.tool_calls)
        ? response.tool_calls
        : [];
    if (toolCalls.length > 0 && needsHumanApproval(toolCalls)) {
        const summary = summarizeToolCalls(toolCalls);
        const approvalPrompt = `I need your approval before I proceed with these actions:\n\n${summary}\n\nReply with "approve" to continue or "reject" to cancel.`;
        return { messages: [new messages_1.AIMessage({ content: approvalPrompt })], pendingToolCalls: toolCalls };
    }
    return { messages: [response] };
}
async function toolExecutorNode(state) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    const toolCallsFromMessage = lastMessage && "tool_calls" in lastMessage && lastMessage.tool_calls
        ? lastMessage.tool_calls
        : [];
    const toolCalls = toolCallsFromMessage.length > 0
        ? toolCallsFromMessage
        : (state.pendingToolCalls || []);
    if (toolCalls.length === 0) {
        return { messages: [] };
    }
    const toolResults = [];
    let requiresCalendarReauth = false;
    console.log("toolCalls");
    for (const toolCall of toolCalls) {
        const toolName = toolCall.name;
        const toolInput = toolCall.args;
        let resultStr = "";
        try {
            if (toolName === "query_company_knowledge") {
                const res = await knowledgeBaseTool_1.knowledgeBaseTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "create_jira_issue") {
                const res = await jiraTool_1.createJiraIssueTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "update_jira_issue") {
                const res = await jiraTool_1.updateJiraIssueTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "list_jira_issues") {
                const res = await jiraTool_1.listJiraIssuesTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "list_jira_issues_all") {
                const res = await jiraTool_1.listJiraIssuesAllTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "jira_issue_counts") {
                const res = await jiraTool_1.jiraIssueCountsTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "get_upcoming_events") {
                const res = await calendarTool_1.getUpcomingEventsTool.invoke({});
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "get_events_for_date") {
                const res = await calendarTool_1.getEventsForDateTool.invoke(toolInput.input || toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "create_calendar_event") {
                const createEventToolInput = { ...(toolInput?.input || toolInput) };
                console.log("createEventToolInput", createEventToolInput);
                const res = await calendarTool_1.createEventTool.invoke(createEventToolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "cancel_calendar_event") {
                const res = await calendarTool_1.cancelEventTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "add_attendees_to_event") {
                const res = await calendarTool_1.addAttendeesTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "notify_event_attendees") {
                const res = await calendarTool_1.notifyAttendeesTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "update_calendar_event") {
                const res = await calendarTool_1.updateEventTool.invoke(toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else if (toolName === "web_search") {
                const res = await searchTool_1.webSearchTool.invoke(toolInput.query || toolInput);
                resultStr = typeof res === "string" ? res : JSON.stringify(res);
            }
            else {
                resultStr = "Unknown tool";
            }
        }
        catch (error) {
            resultStr = `Error executing tool: ${error instanceof Error ? error.message : String(error)}`;
        }
        const needsCalendarReauth = typeof resultStr === "string" &&
            (resultStr.includes("authorization expired") || resultStr.includes("invalid_grant"));
        if (needsCalendarReauth) {
            const authUrl = (0, googleCalendar_1.getCalendarAuthUrl)();
            resultStr = `Google Calendar authorization expired.\nOpen this URL and grant access:\n${authUrl}\n\nThen reply with: calendar_auth <code>`;
            requiresCalendarReauth = true;
        }
        toolResults.push(new messages_1.ToolMessage({
            content: resultStr,
            tool_call_id: toolCall.id
        }));
    }
    const messagesToReturn = [];
    if (toolCallsFromMessage.length === 0) {
        messagesToReturn.push(new messages_1.AIMessage({ content: "", tool_calls: toolCalls }));
    }
    messagesToReturn.push(...toolResults);
    return { messages: messagesToReturn, pendingToolCalls: requiresCalendarReauth ? toolCalls : null };
}
const HITL_TOOL_NAMES = new Set([
    "create_jira_issue",
    "update_jira_issue",
    "create_calendar_event",
    "cancel_calendar_event",
    "add_attendees_to_event",
    "notify_event_attendees",
    "update_calendar_event"
]);
function needsHumanApproval(toolCalls) {
    return toolCalls.some((call) => HITL_TOOL_NAMES.has(call.name));
}
function summarizeToolCalls(toolCalls) {
    return toolCalls
        .map((call, index) => {
        const argsPreview = typeof call.args === "object" ? JSON.stringify(call.args) : String(call.args || "");
        return `${index + 1}. ${call.name} — ${argsPreview}`;
    })
        .join("\n");
}
function shouldContinue(state) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];
    const lastHumanMessage = getLastHumanMessage(messages);
    const approval = lastHumanMessage && typeof lastHumanMessage.content === "string"
        ? parseApproval(lastHumanMessage.content)
        : null;
    const calendarAuthCode = lastHumanMessage && typeof lastHumanMessage.content === "string"
        ? parseCalendarAuthCode(lastHumanMessage.content)
        : null;
    console.log("lastMessage", lastMessage);
    if (state.pendingToolCalls && state.pendingToolCalls.length > 0) {
        if (approval === "approve")
            return "tools";
        if (approval === "reject")
            return "end";
        if (calendarAuthCode)
            return "tools";
        return "end";
    }
    if (lastMessage && "tool_calls" in lastMessage && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        const toolCalls = lastMessage.tool_calls;
        if (needsHumanApproval(toolCalls)) {
            return "end";
        }
        return "tools";
    }
    return "end";
}
const builder = new langgraph_1.StateGraph(state_1.AgentState);
builder.addNode("call_llm", callLLMNode);
builder.addNode("tool_executor", toolExecutorNode);
builder.addConditionalEdges("call_llm", shouldContinue, {
    tools: "tool_executor",
    end: "__end__"
});
builder.addEdge("tool_executor", "call_llm");
builder.setEntryPoint("call_llm");
exports.memory = new langgraph_1.MemorySaver();
exports.graph = builder.compile({
    checkpointer: exports.memory
});
