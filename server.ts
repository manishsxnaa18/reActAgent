import "./loadEnv";
import fs from "fs";
import path from "path";
import os from "os";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart, { MultipartFile } from "@fastify/multipart";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
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

// Simple file-backed chat store for folders and sessions
type StoredChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StoredChatFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type StoredChatSession = {
  id: string;
  title: string;
  folderId: string | null;
  threadId: string;
  createdAt: string;
  updatedAt: string;
  messages: StoredChatMessage[];
};

type ChatUserBucket = {
  folders: StoredChatFolder[];
  sessions: StoredChatSession[];
};

type ChatStore = {
  users: Record<string, ChatUserBucket>;
};

const CHAT_STORE_PATH = process.env.CHAT_STORE_PATH || path.join(process.cwd(), "chatStore.json");
let chatStoreCache: ChatStore | null = null;

async function loadChatStore(): Promise<ChatStore> {
  if (chatStoreCache) {
    return chatStoreCache;
  }

  try {
    const raw = await fs.promises.readFile(CHAT_STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as ChatStore;
    if (parsed && typeof parsed === "object" && (parsed as any).users) {
      chatStoreCache = parsed;
      return parsed;
    }
  } catch {
    // fall through to empty store
  }

  const empty: ChatStore = { users: {} };
  chatStoreCache = empty;
  return empty;
}

async function saveChatStore(store: ChatStore): Promise<void> {
  chatStoreCache = store;
  const dir = path.dirname(CHAT_STORE_PATH);
  await fs.promises.mkdir(dir, { recursive: true }).catch(() => undefined);
  await fs.promises.writeFile(CHAT_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

function getUserBucket(store: ChatStore, userId: string): ChatUserBucket {
  if (!store.users[userId]) {
    store.users[userId] = {
      folders: [],
      sessions: []
    };
  }
  return store.users[userId];
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
        agent: [
          "POST /api/agent/message",
          "POST /api/agent/decision",
          "POST /api/agent/file-query"
        ],
        chat: [
          "POST /api/chat/folders/create",
          "POST /api/chat/folders/update",
          "POST /api/chat/folders/list",
          "POST /api/chat/folders/delete",
          "POST /api/chat/sessions/create",
          "POST /api/chat/sessions/update",
          "POST /api/chat/sessions/get",
          "POST /api/chat/sessions/list",
          "POST /api/chat/sessions/save-messages",
          "POST /api/chat/sessions/delete"
        ],
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

  app.post("/api/agent/file-query", async (request) => {
    const file = await request.file();
    if (!file) {
      throw new Error("file is required (multipart/form-data)");
    }

    const fields = (file.fields || {}) as Record<string, any>;

    const getFieldValue = (name: string): unknown => {
      const field = fields[name];
      if (!field) return undefined;
      if (Array.isArray(field)) {
        const first = field[0] as any;
        if (first && typeof first === "object" && "value" in first) {
          return first.value;
        }
        return first;
      }
      if (typeof field === "object" && field !== null && "value" in (field as any)) {
        return (field as any).value;
      }
      return field;
    };

    const rawThreadId = getFieldValue("threadId");
    const rawMessage = getFieldValue("message");
    const threadId = (rawThreadId && String(rawThreadId).trim()) || "api-session-1";
    const message: string = rawMessage ? String(rawMessage).trim() : "";

    if (!message) {
      throw new Error("message is required");
    }

    const tempPath = await writeMultipartToTemp(file);
    try {
      // Ingest the uploaded document into the RAG vector store
      await ingestionService.ingestDocument(tempPath);

      // Retrieve context from the newly ingested document based on the question
      const context = await ingestionService.query(message, 8);

      const llm = new ChatOpenAI({
        model: process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || "gpt-5-mini",
        temperature: 0
      });

      const prompt =
        "You are answering questions about an uploaded PDF or document.\n\n" +
        "Here is the context extracted from the document (it may be truncated):\n" +
        context +
        "\n\nUser question:\n" +
        message +
        "\n\nProvide a clear answer using only the information in the document context above. " +
        "If the context does not contain the answer, say that the document does not provide that information.";

      const result = await llm.invoke([new HumanMessage(prompt)]);
      const responseText =
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content ?? "");

      return ok({
        threadId,
        response: responseText,
        source: "file",
        fileName: file.filename || null
      });
    } finally {
      await fs.promises.unlink(tempPath).catch(() => undefined);
    }
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

  // Chat folders and sessions APIs
  app.post("/api/chat/folders/create", async (request) => {
    const body = (request.body || {}) as { userId?: string; name?: string };
    const userId = body.userId?.trim();
    const name = body.name?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!name) {
      throw new Error("name is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);
    const now = new Date().toISOString();

    const folder: StoredChatFolder = {
      id: `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      createdAt: now,
      updatedAt: now
    };

    user.folders.push(folder);
    await saveChatStore(store);

    return ok({ folder });
  });

  app.post("/api/chat/folders/update", async (request) => {
    const body = (request.body || {}) as { userId?: string; folderId?: string; name?: string };
    const userId = body.userId?.trim();
    const folderId = body.folderId?.trim();
    const name = body.name?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!folderId) {
      throw new Error("folderId is required");
    }
    if (!name) {
      throw new Error("name is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);
    const folder = user.folders.find((f) => f.id === folderId);

    if (!folder) {
      throw new Error("Folder not found");
    }

    folder.name = name;
    folder.updatedAt = new Date().toISOString();
    await saveChatStore(store);

    return ok({ folder });
  });

  app.post("/api/chat/folders/list", async (request) => {
    const body = (request.body || {}) as { userId?: string };
    const userId = body.userId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);

    return ok({ folders: user.folders });
  });

  app.post("/api/chat/folders/delete", async (request) => {
    const body = (request.body || {}) as { userId?: string; folderId?: string };
    const userId = body.userId?.trim();
    const folderId = body.folderId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!folderId) {
      throw new Error("folderId is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);

    const beforeFolders = user.folders.length;
    user.folders = user.folders.filter((f) => f.id !== folderId);

    if (user.folders.length === beforeFolders) {
      throw new Error("Folder not found");
    }

    user.sessions = user.sessions.filter((s) => s.folderId !== folderId);

    await saveChatStore(store);

    return ok({ deleted: true });
  });

  app.post("/api/chat/sessions/create", async (request) => {
    const body = (request.body || {}) as {
      userId?: string;
      title?: string;
      folderId?: string | null;
      threadId?: string;
      messages?: StoredChatMessage[];
    };

    const userId = body.userId?.trim();
    if (!userId) {
      throw new Error("userId is required");
    }

    const title = (body.title && String(body.title).trim()) || "New chat";
    const folderId = body.folderId && typeof body.folderId === "string"
      ? body.folderId.trim()
      : body.folderId ?? null;
    const threadId = (body.threadId && String(body.threadId).trim()) || `api-session-${Date.now()}`;
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const now = new Date().toISOString();
    const store = await loadChatStore();
    const user = getUserBucket(store, userId);

    if (folderId && !user.folders.find((f) => f.id === folderId)) {
      throw new Error("folderId does not exist for this user");
    }

    const session: StoredChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      folderId,
      threadId,
      createdAt: now,
      updatedAt: now,
      messages
    };

    user.sessions.push(session);
    await saveChatStore(store);

    return ok({ session });
  });

  app.post("/api/chat/sessions/update", async (request) => {
    const body = (request.body || {}) as {
      userId?: string;
      sessionId?: string;
      title?: string;
      folderId?: string | null;
    };

    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);
    const session = user.sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (typeof body.title !== "undefined") {
      const title = String(body.title).trim();
      if (title) {
        session.title = title;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "folderId")) {
      const folderId = body.folderId === null
        ? null
        : (typeof body.folderId === "string" ? body.folderId.trim() : null);

      if (folderId && !user.folders.find((f) => f.id === folderId)) {
        throw new Error("folderId does not exist for this user");
      }

      session.folderId = folderId;
    }

    session.updatedAt = new Date().toISOString();
    await saveChatStore(store);

    return ok({ session });
  });

  app.post("/api/chat/sessions/get", async (request) => {
    const body = (request.body || {}) as { userId?: string; sessionId?: string };
    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);
    const session = user.sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    return ok({ session });
  });

  app.post("/api/chat/sessions/list", async (request) => {
    const body = (request.body || {}) as { userId?: string; includeMessages?: boolean };
    const userId = body.userId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);
    const includeMessages = Boolean(body.includeMessages);

    const sessions = includeMessages
      ? user.sessions
      : user.sessions.map((s) => ({
          id: s.id,
          title: s.title,
          folderId: s.folderId,
          threadId: s.threadId,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        }));

    return ok({
      folders: user.folders,
      sessions
    });
  });

  app.post("/api/chat/sessions/save-messages", async (request) => {
    const body = (request.body || {}) as {
      userId?: string;
      sessionId?: string;
      messages?: StoredChatMessage[];
    };

    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!sessionId) {
      throw new Error("sessionId is required");
    }
    if (!Array.isArray(body.messages)) {
      throw new Error("messages must be an array");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);
    const session = user.sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    session.messages = body.messages;
    session.updatedAt = new Date().toISOString();
    await saveChatStore(store);

    return ok({ session });
  });

  app.post("/api/chat/sessions/delete", async (request) => {
    const body = (request.body || {}) as { userId?: string; sessionId?: string };
    const userId = body.userId?.trim();
    const sessionId = body.sessionId?.trim();

    if (!userId) {
      throw new Error("userId is required");
    }
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const store = await loadChatStore();
    const user = getUserBucket(store, userId);

    const before = user.sessions.length;
    user.sessions = user.sessions.filter((s) => s.id !== sessionId);

    if (user.sessions.length === before) {
      throw new Error("Session not found");
    }

    await saveChatStore(store);

    return ok({ deleted: true });
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
    const body = (request.body || {}) as { text?: string; language?: string; voice?: string };
    const text = body.text?.trim();
    if (!text) {
      throw new Error("text is required");
    }

    const speechFilePath = await synthesizeSpeech(
      text,
      (body.language || "en").trim(),
      body.voice && body.voice.trim() ? body.voice.trim() : undefined
    );
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
