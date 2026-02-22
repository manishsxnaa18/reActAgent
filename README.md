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
- **🔍 Web Search**: Search for current events, news, and public information
- **📅 Google Calendar**: Manage personal events and schedules
- **🤖 Smart Routing**: LLM automatically selects the right tool
- **⚡ GPT-5 Mini**: Default model for fast, cost-effective responses

## How It Works

1. **User asks a question**
2. **LLM intelligently routes to the appropriate tool:**
   - **Company Knowledge Base (RAG)**: Company policies, balance sheets, product catalogs
   - **Web Search**: Current events, news, public information
   - **Google Calendar**: Personal meetings, events, schedules
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
PINECONE_API_KEY=pcsk_...
TAVILY_API_KEY=tvly-...

# Optional
DEFAULT_MODEL=gpt-5-mini
AGENT_NAME=Meera
GOOGLE_ACCESS_TOKEN=ya29...
GOOGLE_REFRESH_TOKEN=1//...
```

Set `AGENT_NAME` to personalize the assistant (default: `Meera`).

### Get API Keys:

| Service | URL | Purpose |
|---------|-----|---------|
| OpenAI | https://platform.openai.com/api-keys | LLM and embeddings |
| Pinecone | https://www.pinecone.io/ | Vector database |
| Tavily | https://tavily.com/api/ | Web search |
| Google Cloud | https://console.cloud.google.com/ | Calendar API |

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

## 📂 Project Structure

```
reActAgent/
├── graph/
│   ├── agentGraph.ts      # Main agent with LangGraph
│   └── state.ts           # Agent state schema
├── tools/
│   ├── calendarTool.ts    # Google Calendar tools
│   ├── searchTool.ts      # Web search tool
│   └── knowledgeBaseTool.ts # RAG query tool (NEW)
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
5. 🔄 Upload your company documents
6. 🎉 Ask questions!

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

