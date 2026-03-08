# ReAct Agent with RAG, Web Search & Google Calendar

A powerful ReAct agent with RAG (Retrieval Augmented Generation) capabilities using LangGraph, LangChain, Pinecone, OpenAI, Tavily (web search), and Google Calendar.

## 🌟 Features

- **🧠 RAG System (NEW)**: Query company knowledge base (policies, financials, product info)
  - Supports: TXT, PDF, CSV, Excel (XLSX), **Images (JPEG, JPG, PNG)**
  - OpenAI embeddings + Vision API for image analysis
  - Pinecone vector database
  - Intelligent document chunking and retrieval
- **📅 Calendar Control (NEW)**: Full event lifecycle management
  - Create, update, reschedule, or cancel events
  - Add attendees and send notifications
  - Manage locations, descriptions, and reminders
- **📇 Contact CRM (NEW)**: Save and search trusted contacts in MongoDB
  - Normalized storage for names, emails, and mobile numbers
  - Quick lookup before messaging or scheduling
- **💬 Multi-Channel Messaging (NEW)**: Reach contacts on their preferred channel
  - Gmail (via Google OAuth)
  - Slack DM or channel posts with @mentions (via Bot token)
  - WhatsApp 1:1 messages (via Twilio)
  - *Note: WhatsApp Business API does not allow programmatic group actions via Twilio*
- **📊 Jira Automation (NEW)**: Create/update tickets, sprints, and weekly Slack digests
  - Create tickets with attachments, assignees, and reporters
  - Update sprints (create/rename/start/complete)
  - List teammate workloads filtered by stage (To Do, In Progress, UAT, Closed)
  - Broadcast weekly issue counts to Slack channels
- **🔍 Web Search**: Search for current events, news, and public information
- **🤖 Smart Routing**: LLM automatically selects the right tool
- **⚡ GPT-5 Mini**: Default model for fast, cost-effective responses

## How It Works

1. **User asks a question**
2. **LLM intelligently routes to the appropriate tool:**
   - **Company Knowledge Base (RAG)**: Company policies, balance sheets, product catalogs
   - **Web Search**: Current events, news, public information
  - **Google Calendar**: Personal meetings, events, schedules
  - **Contacts & Messaging**: Save, recall, and message stakeholders across Gmail/Slack/WhatsApp
  - **Jira Automation**: Create/update tickets, sprints, and publish weekly summaries
3. **Returns accurate, context-aware answers**

## 🚀 Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Variables

Create a `.env` file with the following keys:

```bash
# Required
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=pcsk-...
TAVILY_API_KEY=tvly-...

# Assistant & Model (optional)
DEFAULT_MODEL=gpt-5-mini
AGENT_NAME=Meera

# Voice (optional)
# If you want voice input/output in the CLI
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
VOICE_RECORD_SECONDS=8

# Google Calendar + Gmail (optional but required for scheduling/messaging)
GOOGLE_ACCESS_TOKEN=ya29...
GOOGLE_REFRESH_TOKEN=1//...
GMAIL_SENDER_ADDRESS=you@company.com

# MongoDB Contacts (optional but required for CRM/messaging)
MONGODB_URI=mongodb+srv://...
MONGODB_DB=reactAgent
MONGODB_CONTACTS_COLLECTION=contacts

# Slack Messaging (optional)
SLACK_BOT_TOKEN=xoxb-...
# Required Slack scopes: `chat:write`, `conversations:read`, `conversations.write`, `users:read.email`

# WhatsApp Messaging via Twilio (optional)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=+1XXXXXXXXXX

# Jira Cloud (optional but required for Jira tools)
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=OPS
JIRA_BOARD_ID=123
```

Customize `AGENT_NAME` to change the assistant persona (defaults to **Meera**). Messaging/CRM tools become available once their respective credentials are set.

### Get API Keys:

| Service | URL | Purpose |
|---------|-----|---------|
| OpenAI | https://platform.openai.com/api-keys | LLM and embeddings |
| Pinecone | https://www.pinecone.io/ | Vector database |
| Tavily | https://tavily.com/api/ | Web search |
| Google Cloud | https://console.cloud.google.com/ | Calendar & Gmail APIs |
| MongoDB Atlas | https://www.mongodb.com/cloud/atlas | Contact storage |
| Slack API | https://api.slack.com/apps | DM via bot token |
| Twilio | https://www.twilio.com/whatsapp | WhatsApp messaging |
| Jira Cloud | https://id.atlassian.com/manage-profile/security/api-tokens | Issue + sprint automation |

### 3. Initialize RAG System

Ingest company documents into the knowledge base:

```bash
npm run ingest
```

This launches an interactive CLI where you can:
- Upload individual documents
- Batch upload from a directory
- Test queries against the knowledge base

Sample documents are provided in the `uploads/` folder:
- `company_policies.txt`
- `balance_sheet_2025.txt`  
- `product_catalog.txt`

### 4. Run the Agent

```bash
npm run dev
```

## 🎙️ Voice Input & Local Language Output

In the CLI, type:

```
/voice
```

Speak your query in any language. The assistant will:
1) Transcribe your voice
2) Detect the language
3) Answer in the same language
4) Play the response as voice

You can also specify recording seconds:

```
/voice 6
```

### Notes
- Voice input uses `node-record-lpcm16`, which requires a recording backend.
  - **macOS**: install SoX (`brew install sox`)
  - **Linux**: install `arecord` (usually via `alsa-utils`)
  - **Windows**: use `sox` or update the recorder program in code
- Voice output uses OpenAI TTS and plays audio locally (`afplay` on macOS).

## 📚 Example Questions

### Company Knowledge (RAG)
```
"What is our remote work policy?"
"What's our current debt-to-equity ratio?"
"How much does ACME DataGuard Pro cost?"
"How many vacation days do employees get?"
"What information is shown in the uploaded chart?"
"Describe the product diagram"
```

### Web Search (Current Events)
```
"What's the latest news about AI?"
"When is the next FIFA World Cup?"
"What happened at the 2024 Olympics?"
```

### Google Calendar (Personal Schedule)
```
"What are my upcoming meetings?"
"Schedule a meeting with John at 3pm tomorrow"
"What's on my calendar for next week?"
```

### Contacts & Messaging
```
"Save Sofia Ramirez with sofia@contoso.com and +1 917 555 0114"
"List my recent contacts"
"Send a Slack ping to Mark to confirm tomorrow's demo"
"WhatsApp Priya that the agenda changed"
"Post in #launch-war-room that the rollout moved to 3pm"
"Add Manish to #xyz-group and tag him with the new action items"
```

### Jira Automation
```
"Create a Jira ticket titled 'Checkout bug' assigned to Manish with today's logs attached"
"Move OPS-231 to UAT and reassign it to Pallavi"
"Create a sprint called March Alpha from Mar 1 to Mar 14"
"List Priya's UAT and Done tickets"
"Send a Jira weekly summary for Manish and Pallavi to #engineering-weekly"
```

## 🛠️ Tools Available

| Tool | Description | Use Case |
|------|-------------|----------|
| `query_company_knowledge` | RAG retrieval from vector DB | Company info, policies, financials |
| `web_search` | Tavily web search | Current events, news, public data |
| `get_upcoming_events` | Google Calendar lookup | Personal schedule |
| `get_events_for_date` | Calendar for specific date | Check availability |
| `create_calendar_event` | Schedule new event | Create meetings |
| `update_calendar_event` | Modify date/time, location, attendees | Reschedule or edit events |
| `cancel_calendar_event` | Cancel an event (optionally notify attendees) | Remove meetings |
| `add_attendees_to_event` | Add guests to an existing event | Invite colleagues |
| `notify_event_attendees` | Send email updates via Calendar notifications | Inform guests |
| `save_contact` | Persist a contact's name/email/mobile in MongoDB | Build company rolodex |
| `list_contacts` | View recently updated contacts | Recall people before meetings |
| `message_contact` | Send Gmail, Slack DM, or WhatsApp via stored info | Follow up with stakeholders |
| `message_slack_channel` | Post updates in Slack channels/groups and @mention contacts | Team-wide notifications |
| `add_contact_to_slack_channel` | Invite a saved contact into a Slack channel | Keep teammates in the loop |
| `create_jira_issue` | Create Jira tickets with attachments | Intake bugs/requests |
| `update_jira_issue` | Edit Jira tickets, swap owners, move stages | Keep work items current |
| `manage_jira_sprint` | Create/update/close sprints | Sprint hygiene |
| `list_jira_issues` | List Jira issues for a teammate filtered by status | Workload review |
| `jira_issue_counts` | Summarize counts per person (optional Slack post) | Weekly status broadcast |
| `jira_user_digest` | Post per-person Jira issue lists to Slack | Weekly digest with details |

## 📂 Project Structure

```
reActAgent/
├── graph/
│   ├── agentGraph.ts      # Main agent with LangGraph
│   └── state.ts           # Agent state schema
├── tools/
│   ├── calendarTool.ts    # Google Calendar tools
│   ├── searchTool.ts      # Web search tool
│   ├── contactsTool.ts    # Mongo-backed contact + messaging tools (NEW)
│   ├── jiraTool.ts        # Jira issue + sprint tools (NEW)
│   └── knowledgeBaseTool.ts # RAG query tool (NEW)
├── contacts/
│   └── contactService.ts  # MongoDB contact CRUD (NEW)
├── integrations/
│   ├── messagingService.ts # Gmail, Slack, WhatsApp senders (NEW)
│   └── jiraService.ts      # Jira REST helpers (NEW)
├── rag/                   # RAG System (NEW)
│   ├── documentParsers.ts # Parse TXT, PDF, CSV, Excel
│   ├── embeddings.ts      # OpenAI embeddings
│   ├── vectorStore.ts     # Pinecone integration
│   └── ingestionService.ts # Document processing orchestration
├── uploads/               # Sample company documents
├── index.ts              # Main entry point
├── ingestDocuments.ts    # Document ingestion CLI (NEW)
└── package.json
```

## 🏗️ Architecture

```
User Question
      │
      ▼
┌─────────────────────────────────────┐
│  LLM with Enhanced System Prompt    │
│  (Intelligent Tool Selection)       │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┬──────────┬─────────┐
       │               │          │         │
       ▼               ▼          ▼         ▼
┌──────────┐  ┌──────────────┐  ┌────┐  ┌────┐
│ RAG Tool │  │ Web Search   │  │Cal │  │Cal │
│ (Pinecone)│  │ (Tavily)    │  │Get │  │Set │
└──────────┘  └──────────────┘  └────┘  └────┘
       │               │          │         │
       └───────┬───────┴──────────┴─────────┘
               ▼
     ┌─────────────────┐
     │  Final Answer   │
     └─────────────────┘
```

## 🧪 RAG System Details

### Document Processing Pipeline

1. **Upload** → Documents placed in `uploads/` directory
2. **Parse** → Extract text from TXT, PDF, CSV, Excel, or analyze images with Vision API
3. **Chunk** → Split into 1000-char chunks with 200-char overlap
4. **Embed** → Generate embeddings using OpenAI text-embedding-3-small
5. **Store** → Upsert vectors to Pinecone with metadata
6. **Query** → Semantic search retrieves top-K relevant chunks

### Supported File Types

- **TXT/MD**: Plain text and markdown
- **PDF**: Parsed using pdf-parse
- **CSV**: Structured data with headers
- **Excel (XLSX/XLS)**: Multi-sheet workbooks
- **Images (JPG/JPEG/PNG)**: OCR and visual analysis via GPT-4 Vision

### Vector Database (Pinecone)

- **Index**: company-knowledge
- **Dimension**: 1536 (text-embedding-3-small)
- **Metric**: Cosine similarity
- **Cloud**: AWS us-east-1 (serverless)

## 🔧 Advanced Usage

### Programmatic Document Ingestion

```typescript
import { ingestionService } from "./rag/ingestionService";

// Initialize
await ingestionService.initialize();

// Ingest single file
await ingestionService.ingestDocument("./path/to/document.pdf");

// Ingest directory
await ingestionService.ingestDirectory("./company-docs");

// Query
const context = await ingestionService.query("What is the vacation policy?", 5);
```

### Custom Chunk Sizes

```typescript
// Larger chunks for technical docs
await ingestionService.ingestDocument(
  "./technical-manual.pdf",
  2000,  // chunk size
  400    // overlap
);
```

## 🎯 Best Practices

1. **Document Organization**: Keep related documents together
2. **Clear Naming**: Use descriptive filenames (e.g., `q4_2025_financials.xlsx`)
3. **Update Regularly**: Re-ingest documents when they change
4. **Test Queries**: Use the ingestion CLI to test retrieval quality
5. **Monitor Costs**: OpenAI embeddings cost ~$0.13 per 1M tokens

## 🐛 Troubleshooting

### "No relevant information found"
- Check if documents were successfully ingested
- Try rephrasing your question
- Verify Pinecone index contains data

### Pinecone Connection Errors
- Verify `PINECONE_API_KEY` is set correctly
- Check index name matches (default: `company-knowledge`)
- Ensure index is created (run initialization)

### PDF Parsing Issues
- Install `pdf-parse`: `npm install pdf-parse`
- Some PDFs with images may extract poorly
- Consider converting to text first

### WhatsApp Group Actions
- Twilio's WhatsApp Business API only supports 1:1 Business-to-User threads
- Group invites/messages must be handled manually or via Meta's Cloud API (not yet integrated)
- Use Slack channel tools for group broadcasts and mentions

### Jira API Errors
- Ensure `JIRA_BASE_URL`, `JIRA_EMAIL`, and `JIRA_API_TOKEN` are set (Cloud PAT only)
- Double-check project key and board ID values
- If stage transitions fail, confirm the workflow exposes a transition that matches the requested status name

## 📊 Performance

- **Embedding Speed**: ~1000 tokens/sec
- **Query Latency**: < 500ms (Pinecone)
- **Chunk Recommendation**: 1000 chars with 200 overlap
- **Top-K**: 3-5 chunks for most queries

## 🚦 Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Set environment variables in `.env`
3. ✅ Run ingestion: `npm run ingest`
4. ✅ Test the agent: `npm run dev`
5. ✅ Start API server: `npm run dev:api`
5. 🔄 Upload your company documents
6. 🎉 Ask questions!

## 🌐 Fastify API (Frontend Integration)

- Run API in dev mode: `npm run dev:api`
- Build and run in prod:
  - `npm run build`
  - `npm run start:api`
- API base URL: `http://localhost:3001`
- Full endpoint list and examples: `docs/api.md`

## 📝 License

MIT

---

**Built with**: LangGraph, LangChain, OpenAI, Pinecone, Tavily, Google Calendar API
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

