# Fastify API

This project now supports both:
- CLI mode (existing): `npm run dev`
- API mode (new): `npm run dev:api`

Production:
- Build: `npm run build`
- Start CLI: `npm run start`
- Start API: `npm run start:api`

Default API URL: `http://localhost:3001`

## Core endpoints

### Health
- `GET /api/health`

### Capabilities list
- `GET /api/meta/capabilities`

### Agent
- `POST /api/agent/message`
```json
{
  "threadId": "user-1",
  "message": "What are my meetings tomorrow?"
}
```

- `POST /api/agent/decision`
```json
{
  "threadId": "user-1",
  "decision": "approve"
}
```

For Google re-auth:
```json
{
  "threadId": "user-1",
  "decision": "calendar_auth",
  "calendarAuthCode": "4/0Ab..."
}
```

## RAG / Knowledge Base

- `POST /api/rag/initialize`
- `POST /api/rag/query`
```json
{
  "query": "remote work policy",
  "topK": 5
}
```

- `POST /api/rag/ingest/file` (multipart form-data with `file`)
- `POST /api/rag/ingest/directory`
```json
{
  "directoryPath": "./uploads",
  "chunkSize": 1000,
  "overlap": 200
}
```

- `POST /api/knowledge/query`
```json
{
  "query": "What is our leave policy?"
}
```

## Web search

- `POST /api/search/web`
```json
{
  "query": "latest AI news"
}
```

## Calendar

- `GET /api/calendar/upcoming`
- `POST /api/calendar/by-date`
```json
{ "input": "next monday" }
```

- `POST /api/calendar/create`
```json
{
  "title": "Sprint planning",
  "startTime": "2026-03-10T09:00:00Z",
  "endTime": "2026-03-10T10:00:00Z",
  "description": "Planning",
  "location": "Meet"
}
```

- `POST /api/calendar/update`
- `POST /api/calendar/cancel`
- `POST /api/calendar/add-attendees`
- `POST /api/calendar/notify-attendees`

OAuth helper endpoints:
- `GET /api/calendar/auth/url`
- `POST /api/calendar/auth/exchange-code`
- `POST /api/calendar/auth/set-tokens`

## Jira

- `POST /api/jira/issues/create`
- `POST /api/jira/issues/update`
- `POST /api/jira/issues/list`
- `POST /api/jira/issues/list-all`
- `POST /api/jira/issues/counts`

## Voice + Language

- `POST /api/voice/transcribe` (multipart form-data with audio `file`)
- `POST /api/voice/synthesize`
```json
{
  "text": "Hello team",
  "language": "en"
}
```

- `POST /api/language/detect`
```json
{ "text": "नमस्ते" }
```

- `POST /api/language/translate`
```json
{
  "text": "Hola",
  "targetLang": "en",
  "sourceLang": "es"
}
```

## Notes

- API returns JSON shape:
  - success: `true` with `data`
  - success: `false` with `error`
- Existing CLI input flow is unchanged.
- Configure env vars in `.env` the same way as CLI mode.