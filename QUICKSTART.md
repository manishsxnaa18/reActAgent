# Quick Start Guide - RAG-Enhanced ReAct Agent

## 🚀 5-Minute Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
# Edit .env and add your API keys
```

**Required API Keys:**
- `OPENAI_API_KEY` - https://platform.openai.com/api-keys
- `PINECONE_API_KEY` - https://www.pinecone.io/
- `TAVILY_API_KEY` - https://tavily.com/api/

**Optional connectors (unlock extra tools):**
- `GOOGLE_ACCESS_TOKEN` + `GOOGLE_REFRESH_TOKEN` + `GMAIL_SENDER_ADDRESS` — calendar + Gmail messaging
- `MONGODB_URI` (+ `MONGODB_DB`, `MONGODB_CONTACTS_COLLECTION`) — persistent contact book
- `SLACK_BOT_TOKEN` — Slack DM support
- Slack bot must include `chat:write`, `conversations:read`, `conversations.write`, `users:read.email` scopes
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — WhatsApp messaging (1:1 threads only via Twilio)
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `JIRA_BOARD_ID` — Jira issues + sprints + Slack digests

### Step 3: Ingest Sample Documents
```bash
npm run ingest
```

In the menu:
1. Choose option `2` (Ingest directory)
2. Enter path: `./uploads`
3. Wait for processing to complete

### Step 4: Run the Agent
```bash
npm run dev
```

## 🧪 Test Queries

Try these questions to test different capabilities:

### RAG (Company Knowledge)
```
> What is our remote work policy?
> How much does ACME DataGuard Pro cost?
> What's our debt-to-equity ratio?
```

### Web Search
```
> What's the latest news about AI?
> When is the next Olympics?
```

### Calendar (if configured)
```
> What are my upcoming meetings?
> Schedule a meeting tomorrow at 2pm
```

### Contacts & Messaging (if configured)
```
> Save Priya with priya@acme.com and +91 98 765 4321
> List my contacts
> Send a Slack ping to Alex about the deck
> WhatsApp Evan that the call moved to 4pm
> Post in #launch-war-room that the rollout moved to 3pm and @mention Priya
> Add Manish to #xyz-group
```

### Jira Automation (if configured)
```
> Create a Jira ticket "Payments bug" assigned to Manish with priority High
> Move OPS-220 to UAT and assign it to Pallavi
> List Priya's Done issues
> Send a Jira summary for Manish and Pallavi to #weekly-status
```

## 📁 Adding Your Own Documents

1. Place documents in `./uploads/` directory
2. Run `npm run ingest`
3. Select option 2 (Ingest directory)
4. Enter `./uploads`

**Supported formats:** TXT, MD, PDF, CSV, XLSX, XLS, JPG, JPEG, PNG

## 🔧 Common Issues

### "OPENAI_API_KEY not set"
→ Copy `.env.example` to `.env` and add your key

### "Failed to initialize Pinecone"
→ Check your `PINECONE_API_KEY` is valid

### "No relevant information found"
→ Make sure you've ingested documents first

## 📚 Next Steps

1. ✅ Read the full [README.md](README.md)
2. 🔄 Add your company documents to `./uploads/`
3. 🧪 Experiment with different query types
4. 🎯 Customize the system prompt in `graph/agentGraph.ts`

## 💡 Pro Tips

- **Chunk Size**: Adjust in `ingestionService.ts` for better accuracy
- **Top-K Results**: Change from 5 to 3-10 based on your needs
- **Model Selection**: Set `DEFAULT_MODEL=gpt-4o` for higher quality
- **Cost Optimization**: Use `gpt-5-mini` for development
- **Persona**: Change `AGENT_NAME` to give the CLI a custom greeting

---

Need help? Check the [README.md](README.md) or open an issue.
