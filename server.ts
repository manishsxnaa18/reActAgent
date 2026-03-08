import "dotenv/config";
import fs from "fs";
import path from "path";
import os from "os";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart, { MultipartFile } from "@fastify/multipart";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { graph } from "./graph/agentGraphCRAGSelfRAG";
import { ingestionService } from "./rag/ingestionService";
import { knowledgeBaseTool } from "./tools/knowledgeBaseTool";
import { webSearchTool } from "./tools/searchTool";
import {
  getUpcomingEventsTool,
  getEventsForDateTool,
  createEventTool,
  cancelEventTool,
  addAttendeesTool,
  notifyAttendeesTool,
  updateEventTool
} from "./tools/calendarTool";
import {
  getCalendarAuthUrl,
  exchangeAuthCode,
  setCredentials
} from "./tools/googleCalendar";
import {
  createJiraIssueTool,
  updateJiraIssueTool,
  listJiraIssuesTool,
  listJiraIssuesAllTool,
  jiraIssueCountsTool
} from "./tools/jiraTool";
import {
  transcribeAudio,
  synthesizeSpeech
} from "./utils/voice";
import {
  detectLanguage,
  translateText
} from "./utils/translation";

const app = Fastify({ logger: true });

type ApiSuccess = {
  success: true;
  data: unknown;
};

type ApiError = {
  success: false;
  error: string;
};

function ok(data: unknown): ApiSuccess {
  return { success: true, data };
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getAssistantText(result: any): string {
  const messages = (result?.messages || []) as BaseMessage[];
  const lastMessage = messages[messages.length - 1] as any;
  if (!lastMessage) {
    return "";
  }

  if (typeof lastMessage.content === "string") {
    return lastMessage.content;
  }

  return JSON.stringify(lastMessage.content || "");
}

function mapDecisionToMessage(decision: string, calendarAuthCode?: string): string {
  const normalized = decision.trim().toLowerCase();
  if (normalized === "approve") {
    return "approve";
  }
  if (normalized === "reject") {
    return "reject";
  }
  if (normalized === "calendar_auth" || normalized === "calendar auth") {
    if (!calendarAuthCode?.trim()) {
      throw new Error("calendarAuthCode is required when decision is calendar_auth");
    }
    return `calendar_auth ${calendarAuthCode.trim()}`;
  }

  throw new Error("Invalid decision. Use approve, reject, or calendar_auth.");
}

async function writeMultipartToTemp(file: MultipartFile, extHint?: string): Promise<string> {
  const ext = extHint || path.extname(file.filename || "") || ".bin";
  const tempPath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  const buffer = await file.toBuffer();
  await fs.promises.writeFile(tempPath, buffer);
  return tempPath;
}

app.setErrorHandler(async (error, _request, reply) => {
  app.log.error(error);
  const message = error instanceof Error ? error.message : "Internal server error";
  const payload: ApiError = {
    success: false,
    error: message
  };
  return reply.status(400).send(payload);
});

async function registerPlugins() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true
  });

  await app.register(multipart, {
    attachFieldsToBody: false,
    limits: {
      fileSize: Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024)
    }
  });
}

function registerRoutes() {
  app.get("/api/health", async () => {
    return ok({ status: "ok", service: "react-agent-api" });
  });

  app.get("/api/meta/capabilities", async () => {
    return ok({
      server: "fastify",
      endpoints: {
        agent: ["POST /api/agent/message", "POST /api/agent/decision"],
        rag: ["POST /api/rag/initialize", "POST /api/rag/query", "POST /api/rag/ingest/file", "POST /api/rag/ingest/directory"],
        search: ["POST /api/search/web"],
        calendar: [
          "GET /api/calendar/upcoming",
          "POST /api/calendar/by-date",
          "POST /api/calendar/create",
          "POST /api/calendar/update",
          "POST /api/calendar/cancel",
          "POST /api/calendar/add-attendees",
          "POST /api/calendar/notify-attendees",
          "GET /api/calendar/auth/url",
          "POST /api/calendar/auth/exchange-code",
          "POST /api/calendar/auth/set-tokens"
        ],
        jira: [
          "POST /api/jira/issues/create",
          "POST /api/jira/issues/update",
          "POST /api/jira/issues/list",
          "POST /api/jira/issues/list-all",
          "POST /api/jira/issues/counts"
        ],
        voice: ["POST /api/voice/transcribe", "POST /api/voice/synthesize"],
        language: ["POST /api/language/detect", "POST /api/language/translate"]
      }
    });
  });

  app.post("/api/agent/message", async (request) => {
    const body = (request.body || {}) as { threadId?: string; message?: string };
    const threadId = body.threadId?.trim() || "api-session-1";
    const message = body.message?.trim();

    if (!message) {
      throw new Error("message is required");
    }

    const invokeConfig: RunnableConfig = {
      configurable: { thread_id: threadId }
    };

    const result = await graph.invoke(
      { messages: [new HumanMessage(message)] as BaseMessage[] },
      invokeConfig
    );

    const responseText = getAssistantText(result);

    return ok({
      threadId,
      response: responseText,
      requiresApproval: responseText.toLowerCase().includes("reply with \"approve\"")
    });
  });

  app.post("/api/agent/decision", async (request) => {
    const body = (request.body || {}) as {
      threadId?: string;
      decision?: string;
      calendarAuthCode?: string;
    };

    const threadId = body.threadId?.trim() || "api-session-1";
    const decision = body.decision?.trim();
    if (!decision) {
      throw new Error("decision is required");
    }

    const message = mapDecisionToMessage(decision, body.calendarAuthCode);
    const invokeConfig: RunnableConfig = {
      configurable: { thread_id: threadId }
    };

    const result = await graph.invoke(
      { messages: [new HumanMessage(message)] as BaseMessage[] },
      invokeConfig
    );

    return ok({
      threadId,
      response: getAssistantText(result)
    });
  });

  app.post("/api/rag/initialize", async () => {
    await ingestionService.initialize();
    return ok({ initialized: true });
  });

  app.post("/api/rag/query", async (request) => {
    const body = (request.body || {}) as { query?: string; topK?: number };
    const query = body.query?.trim();
    if (!query) {
      throw new Error("query is required");
    }
    const topK = body.topK && body.topK > 0 ? body.topK : 5;
    const context = await ingestionService.query(query, topK);
    return ok({ query, topK, context });
  });

  app.post("/api/rag/ingest/file", async (request) => {
    const file = await request.file();
    if (!file) {
      throw new Error("file is required (multipart/form-data)");
    }

    const tempPath = await writeMultipartToTemp(file);
    try {
      const result = await ingestionService.ingestDocument(tempPath);
      return ok(result);
    } finally {
      await fs.promises.unlink(tempPath).catch(() => undefined);
    }
  });

  app.post("/api/rag/ingest/directory", async (request) => {
    const body = (request.body || {}) as { directoryPath?: string; chunkSize?: number; overlap?: number };
    const directoryPath = body.directoryPath?.trim();
    if (!directoryPath) {
      throw new Error("directoryPath is required");
    }
    const results = await ingestionService.ingestDirectory(directoryPath, body.chunkSize || 1000, body.overlap || 200);
    return ok(results);
  });

  app.post("/api/search/web", async (request) => {
    const body = (request.body || {}) as { query?: string };
    const query = body.query?.trim();
    if (!query) {
      throw new Error("query is required");
    }

    const result = await webSearchTool.invoke(query);
    return ok(parseMaybeJson(result));
  });

  app.get("/api/calendar/upcoming", async () => {
    const result = await getUpcomingEventsTool.invoke({});
    return ok(result);
  });

  app.post("/api/calendar/by-date", async (request) => {
    const body = (request.body || {}) as { input?: string };
    if (!body.input?.trim()) {
      throw new Error("input is required (example: 'tomorrow' or 'next monday')");
    }
    const result = await getEventsForDateTool.invoke(body.input);
    return ok(result);
  });

  app.post("/api/calendar/create", async (request) => {
    const result = await createEventTool.invoke((request.body || {}) as any);
    return ok(result);
  });

  app.post("/api/calendar/update", async (request) => {
    const result = await updateEventTool.invoke((request.body || {}) as any);
    return ok(result);
  });

  app.post("/api/calendar/cancel", async (request) => {
    const result = await cancelEventTool.invoke((request.body || {}) as any);
    return ok(result);
  });

  app.post("/api/calendar/add-attendees", async (request) => {
    const result = await addAttendeesTool.invoke((request.body || {}) as any);
    return ok(result);
  });

  app.post("/api/calendar/notify-attendees", async (request) => {
    const result = await notifyAttendeesTool.invoke((request.body || {}) as any);
    return ok(result);
  });

  app.get("/api/calendar/auth/url", async () => {
    return ok({ authUrl: getCalendarAuthUrl() });
  });

  app.post("/api/calendar/auth/exchange-code", async (request) => {
    const body = (request.body || {}) as { code?: string };
    if (!body.code?.trim()) {
      throw new Error("code is required");
    }
    const tokens = await exchangeAuthCode(body.code.trim());
    return ok(tokens);
  });

  app.post("/api/calendar/auth/set-tokens", async (request) => {
    const body = (request.body || {}) as { accessToken?: string; refreshToken?: string };
    if (!body.accessToken?.trim()) {
      throw new Error("accessToken is required");
    }
    setCredentials(body.accessToken.trim(), (body.refreshToken || "").trim());
    return ok({ configured: true });
  });

  app.post("/api/jira/issues/create", async (request) => {
    const result = await createJiraIssueTool.invoke((request.body || {}) as any);
    return ok(parseMaybeJson(result));
  });

  app.post("/api/jira/issues/update", async (request) => {
    const result = await updateJiraIssueTool.invoke((request.body || {}) as any);
    return ok(parseMaybeJson(result));
  });

  app.post("/api/jira/issues/list", async (request) => {
    const result = await listJiraIssuesTool.invoke((request.body || {}) as any);
    return ok(parseMaybeJson(result));
  });

  app.post("/api/jira/issues/list-all", async (request) => {
    const result = await listJiraIssuesAllTool.invoke((request.body || {}) as any);
    return ok(parseMaybeJson(result));
  });

  app.post("/api/jira/issues/counts", async (request) => {
    const result = await jiraIssueCountsTool.invoke((request.body || {}) as any);
    return ok(parseMaybeJson(result));
  });

  app.post("/api/language/detect", async (request) => {
    const body = (request.body || {}) as { text?: string };
    if (!body.text?.trim()) {
      throw new Error("text is required");
    }
    const language = await detectLanguage(body.text);
    return ok({ language });
  });

  app.post("/api/language/translate", async (request) => {
    const body = (request.body || {}) as { text?: string; targetLang?: string; sourceLang?: string };
    if (!body.text?.trim()) {
      throw new Error("text is required");
    }
    if (!body.targetLang?.trim()) {
      throw new Error("targetLang is required");
    }
    const translated = await translateText(body.text, body.targetLang, body.sourceLang);
    return ok({ translated });
  });

  app.post("/api/voice/transcribe", async (request) => {
    const file = await request.file();
    if (!file) {
      throw new Error("audio file is required (multipart/form-data)");
    }

    const ext = path.extname(file.filename || "") || ".wav";
    const tempPath = await writeMultipartToTemp(file, ext);
    try {
      const text = await transcribeAudio(tempPath);
      return ok({ text });
    } finally {
      await fs.promises.unlink(tempPath).catch(() => undefined);
    }
  });

  app.post("/api/voice/synthesize", async (request, reply) => {
    const body = (request.body || {}) as { text?: string; language?: string };
    const text = body.text?.trim();
    if (!text) {
      throw new Error("text is required");
    }

    const speechFilePath = await synthesizeSpeech(text, (body.language || "en").trim());
    const buffer = await fs.promises.readFile(speechFilePath);
    await fs.promises.unlink(speechFilePath).catch(() => undefined);

    reply.header("Content-Type", "audio/mpeg");
    reply.header("Content-Disposition", "inline; filename=tts.mp3");
    return reply.send(buffer);
  });

  app.post("/api/knowledge/query", async (request) => {
    const body = (request.body || {}) as { query?: string };
    const query = body.query?.trim();
    if (!query) {
      throw new Error("query is required");
    }

    const result = await knowledgeBaseTool.invoke({ query });
    return ok(result);
  });
}

async function start() {
  await registerPlugins();
  registerRoutes();

  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || "0.0.0.0";
  await app.listen({ port, host });
}

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
