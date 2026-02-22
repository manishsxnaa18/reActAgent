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

---

Need help? Check the [README.md](README.md) or open an issue.
