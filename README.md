# ReAct Agent with Web Search & Google Calendar

A ReAct agent using LangGraph, LangChain, Tavily (web search), OpenAI (LLM), and Google Calendar.

## Features

- **Web Search**: Search for public events, factual information, news
- **Google Calendar**: Read personal events, check schedules, create events
- **Smart Tool Selection**: LLM automatically chooses the right tool

## How It Works

1. **User asks a question**
2. **LLM decides which tool to use:**
   - **Google Calendar**: for personal meetings, events, schedules
   - **Web Search**: for public events (FIFA World Cup, Olympics, etc.)
   - **Direct Answer**: for general knowledge
3. **Returns the answer**

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set API Keys

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

### Get API Keys:

| Service | URL |
|---------|-----|
| OpenAI | https://platform.openai.com/api-keys |
| Tavily | https://tavily.com/api/ |
| Google Cloud | https://console.cloud.google.com/ |

### Google Calendar Setup:
1. Go to Google Cloud Console
2. Enable Google Calendar API
3. Create OAuth2 credentials
4. Get access and refresh tokens

### 3. Run

```bash
npm run dev
```

## Example Questions

```typescript
// Google Calendar - Personal events
"What are my upcoming meetings?"
"What's on my calendar tomorrow?"
"Schedule a meeting with John at 3pm tomorrow"

// Web Search - Public events
"When was the FIFA World Cup first held?"
"What were the 2024 Summer Olympics dates?"
"What is the next solar eclipse?"

// General Knowledge
"What is the capital of France?"
```

## Tools Available

| Tool | Description |
|------|-------------|
| `get_calendar_events` | Get upcoming events from Google Calendar |
| `get_events_for_date` | Get events for a specific date |
| `create_calendar_event` | Create a new event in Google Calendar |
| `web_search` | Search the web for public information |
| `direct_answer` | Answer general knowledge questions |

## Architecture

```
User Question
      │
      ▼
┌─────────────────┐
│   decide_tool   │ ← LLM chooses the right tool
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  execute_tool   │ ← Run the chosen tool
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ generate_answer │ ← Generate final answer
└────────┬────────┘
         │
         ▼
   Final Answer
```

## Files

| File | Description |
|------|-------------|
| `index.ts` | Main ReAct agent implementation |
| `tools/googleCalendar.ts` | Google Calendar tool |
| `package.json` | Dependencies |
| `tsconfig.json` | TypeScript config |

