/**
 * ReAct Agent with Web Search and Google Calendar
 * Using LangChain, Tavily (search), OpenAI (LLM), Google Calendar
 * 
 * Flow:
 * 1. User asks a question
 * 2. LLM decides: normal query OR needs tool
 * 3. If tool needed → decide which specific tool
 * 4. Execute tool → Generate answer
 */

import "./loadEnv";
import readline from "readline";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { 
  getCalendarEvents, 
  getEventsForDate, 
  createCalendarEvent,
  setCredentials 
} from "./tools/googleCalendar";

// Initialize the LLM
const llm = new ChatOpenAI({
  model: process.env.DEFAULT_MODEL || "gpt-5-mini",
  temperature: 0,
});

// Initialize Tavily search tool
const searchTool = new TavilySearch({
  maxResults: 5,
});

// Set up credentials (in production, these would come from OAuth flow)
const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || "";
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";

if (GOOGLE_ACCESS_TOKEN && GOOGLE_REFRESH_TOKEN) {
  setCredentials(GOOGLE_ACCESS_TOKEN, GOOGLE_REFRESH_TOKEN);
}

// Define the state schema
interface AgentState {
  question: string;
  answer: string;
  needsTool: boolean;
  toolUsed: string;
  toolResult: string;
}

// ============================================================
// STEP 1: Decide if it's a normal query or needs a tool
// ============================================================
async function decideNeedsTool(state: AgentState): Promise<Partial<AgentState>> {
  const question = state.question;

  const systemMessage = new SystemMessage(`You are an AI assistant. Analyze the user's question and decide if you need to use any tools.

Two categories:
1. NORMAL_QUERY - General questions, casual conversation, or anything not requiring tools
2. NEEDS_TOOL - Questions requiring external data (calendar events, web search, etc.)

Guidelines for NEEDS_TOOL:
- Questions about user's personal calendar, meetings, events
- Questions about public events (World Cup, Olympics, sports, news)
- Factual questions requiring current information
- Questions starting with "search", "find", "look up"

Guidelines for NORMAL_QUERY:
- General knowledge questions the AI knows well
- Casual conversation
- Simple greetings
- Opinion-based questions

Respond with ONLY one word: "NORMAL_QUERY" or "NEEDS_TOOL"`);

  const humanMessage = new HumanMessage(question);
  const response = await llm.invoke([systemMessage, humanMessage]);
  
  const decision = String(response.content).trim().toUpperCase();
  const needsTool = decision === "NEEDS_TOOL";

  return { needsTool };
}

// ============================================================
// STEP 2: Decide which specific tool to use (if needed)
// ============================================================
async function decideTool(state: AgentState): Promise<Partial<AgentState>> {
  const question = state.question;

  const systemMessage = new SystemMessage(`You are an AI assistant with access to several tools. Analyze the user's question and decide which specific tool to use.

Available tools:
1. get_calendar_events - Get upcoming events from user's Google Calendar (personal meetings, events)
2. get_events_for_date - Get events for a specific date from Google Calendar
3. create_calendar_event - Create a new event in Google Calendar
4. web_search - Search the web for public events, factual information, news

Guidelines:
- Use "get_calendar_events" for questions about user's personal calendar like "my meetings", "my events"
- Use "get_events_for_date" when user asks about a specific date
- Use "create_calendar_event" when user wants to schedule/create an event
- Use "web_search" for public events (World Cup, Olympics, sports), current news, factual questions

Respond with ONLY the tool name:`);

  const humanMessage = new HumanMessage(question);
  const response = await llm.invoke([systemMessage, humanMessage]);
  
  const toolName = String(response.content).trim().toLowerCase().replace(/"/g, '');

  return { toolUsed: toolName };
}

// ============================================================
// STEP 3: Execute the chosen tool
// ============================================================
async function executeTool(state: AgentState): Promise<Partial<AgentState>> {
  const { question, toolUsed } = state;
  let toolResult = "";

  try {
    switch (toolUsed) {
      case "get_calendar_events":
        toolResult = await getCalendarEvents(10);
        break;
        
      case "get_events_for_date":
        // Extract date from question
        const dateSystemMsg = new SystemMessage("Extract the date from this question. Return only the date in YYYY-MM-DD format, or 'today' if no date is specified.");
        const dateHumanMsg = new HumanMessage(`Question: ${question}`);
        const dateResponse = await llm.invoke([dateSystemMsg, dateHumanMsg]);
        const dateStr = String(dateResponse.content).trim().toLowerCase();
        
        if (dateStr === "today") {
          toolResult = await getCalendarEvents(20, new Date().toISOString());
        } else {
          toolResult = await getEventsForDate(dateStr);
        }
        break;
        
      case "create_calendar_event":
        const eventSystemMsg = new SystemMessage(`Extract event details from the user's question. Return a JSON object with: title, startTime (ISO format), endTime (ISO format), description (optional), location (optional).`);
        const eventHumanMsg = new HumanMessage(`Question: ${question}`);
        const eventResponse = await llm.invoke([eventSystemMsg, eventHumanMsg]);
        
        try {
          const eventDetails = JSON.parse(String(eventResponse.content).replace(/```json|```/g, ''));
          toolResult = await createCalendarEvent(
            eventDetails.title,
            eventDetails.startTime,
            eventDetails.endTime,
            eventDetails.description,
            eventDetails.location
          );
        } catch {
          toolResult = "I need more details to create the event. Please provide: title, start time, and end time.";
        }
        break;
        
      case "web_search":
        const results = await searchTool.invoke({ query: question });
        toolResult = String(results);
        break;
        
      default:
        toolResult = "DIRECT_ANSWER";
        break;
    }
  } catch (error) {
    toolResult = `Error executing tool: ${error}`;
  }

  return { toolResult };
}

// ============================================================
// STEP 4: Generate final answer
// ============================================================
async function generateAnswer(state: AgentState): Promise<Partial<AgentState>> {
  const { question, needsTool, toolUsed, toolResult } = state;
  let answer = "";

  // If no tool needed, answer directly
  if (!needsTool) {
    const systemMsg = new SystemMessage("You are a helpful AI assistant. Answer the user's question thoroughly and accurately.");
    const humanMsg = new HumanMessage(`Question: ${question}`);
    const response = await llm.invoke([systemMsg, humanMsg]);
    answer = String(response.content);
  } 
  // If tool was direct answer (fallback)
  else if (toolResult === "DIRECT_ANSWER") {
    const systemMsg = new SystemMessage("You are a helpful AI assistant. Answer the user's question thoroughly.");
    const humanMsg = new HumanMessage(`Question: ${question}`);
    const response = await llm.invoke([systemMsg, humanMsg]);
    answer = String(response.content);
  }
  // Answer based on tool result
  else {
    const systemMsg = new SystemMessage(`You are a helpful AI assistant. The user asked a question and you used the "${toolUsed}" tool. Provide a comprehensive answer based on the tool result.`);
    const humanMsg = new HumanMessage(`User's Question: ${question}\n\nTool Result:\n${toolResult}`);
    const response = await llm.invoke([systemMsg, humanMsg]);
    answer = String(response.content);
  }

  return { answer };
}

// ============================================================
// Main Agent Function
// ============================================================
async function runAgent(question: string): Promise<string> {
  // Step 1: Decide if tool is needed
  const step1 = await decideNeedsTool({ 
    question, 
    answer: "", 
    needsTool: false, 
    toolUsed: "", 
    toolResult: "" 
  });

  // If no tool needed, answer directly
  if (!step1.needsTool) {
    const final = await generateAnswer({
      question,
      answer: "",
      needsTool: false,
      toolUsed: "",
      toolResult: ""
    });
    return final.answer || "No answer generated";
  }

  // Step 2: Decide which specific tool
  const step2 = await decideTool({ 
    question, 
    answer: "", 
    needsTool: true,
    toolUsed: "", 
    toolResult: "" 
  });

  // Step 3: Execute the tool
  const step3 = await executeTool({ 
    question, 
    answer: "", 
    needsTool: true,
    toolUsed: step2.toolUsed || "", 
    toolResult: "" 
  });

  // Step 4: Generate answer
  const final = await generateAnswer({
    question,
    answer: "",
    needsTool: true,
    toolUsed: step2.toolUsed || "",
    toolResult: step3.toolResult || ""
  });

  return final.answer || "No answer generated";
}

// ============================================================
// Interactive CLI
// ============================================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function startInteractiveMode() {
  console.log("=".repeat(60));
  console.log("ReAct Agent with Web Search & Google Calendar");
  console.log("=".repeat(60));
  console.log("Type your question below (or 'exit' to quit):\n");

  while (true) {
    const question = await promptUser("You: ");
    
    if (question.toLowerCase() === "exit" || question.toLowerCase() === "quit") {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    if (question.trim() === "") {
      continue;
    }

    try {
      console.log("\n🤔 Thinking...\n");
      const answer = await runAgent(question);
      console.log(`\n🤖 Answer: ${answer}\n`);
      console.log("-".repeat(40));
    } catch (error) {
      console.log(`\n❌ Error: ${error}\n`);
    }
  }
}

startInteractiveMode();

