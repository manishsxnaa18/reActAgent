"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const messages_1 = require("@langchain/core/messages");
const agentGraphCRAGSelfRAG_1 = require("./graph/agentGraphCRAGSelfRAG");
const ingestionService_1 = require("./rag/ingestionService");
const knowledgeBaseTool_1 = require("./tools/knowledgeBaseTool");
const searchTool_1 = require("./tools/searchTool");
const calendarTool_1 = require("./tools/calendarTool");
const googleCalendar_1 = require("./tools/googleCalendar");
const jiraTool_1 = require("./tools/jiraTool");
const voice_1 = require("./utils/voice");
const translation_1 = require("./utils/translation");
const app = (0, fastify_1.default)({ logger: true });
function ok(data) {
    return { success: true, data };
}
function parseMaybeJson(value) {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return value;
    }
}
function getAssistantText(result) {
    const messages = (result?.messages || []);
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) {
        return "";
    }
    if (typeof lastMessage.content === "string") {
        return lastMessage.content;
    }
    return JSON.stringify(lastMessage.content || "");
}
function mapDecisionToMessage(decision, calendarAuthCode) {
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
async function writeMultipartToTemp(file, extHint) {
    const ext = extHint || path_1.default.extname(file.filename || "") || ".bin";
    const tempPath = path_1.default.join(os_1.default.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    const buffer = await file.toBuffer();
    await fs_1.default.promises.writeFile(tempPath, buffer);
    return tempPath;
}
const CHAT_STORE_PATH = process.env.CHAT_STORE_PATH || path_1.default.join(process.cwd(), "chatStore.json");
let chatStoreCache = null;
async function loadChatStore() {
    if (chatStoreCache) {
        return chatStoreCache;
    }
    try {
        const raw = await fs_1.default.promises.readFile(CHAT_STORE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && parsed.users) {
            chatStoreCache = parsed;
            return parsed;
        }
    }
    catch {
        // ignore and fall through to default
    }
    const empty = { users: {} };
    chatStoreCache = empty;
    return empty;
}
async function saveChatStore(store) {
    chatStoreCache = store;
    const dir = path_1.default.dirname(CHAT_STORE_PATH);
    await fs_1.default.promises.mkdir(dir, { recursive: true }).catch(() => undefined);
    await fs_1.default.promises.writeFile(CHAT_STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}
function getUserBucket(store, userId) {
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
    const payload = {
        success: false,
        error: message
    };
    return reply.status(400).send(payload);
});
async function registerPlugins() {
    await app.register(cors_1.default, {
        origin: process.env.CORS_ORIGIN || true
    });
    await app.register(multipart_1.default, {
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
                    "POST /api/chat/sessions/create",
                    "POST /api/chat/sessions/update",
                    "POST /api/chat/sessions/get",
                    "POST /api/chat/sessions/list",
                    "POST /api/chat/sessions/save-messages"
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
    app.post("/api/chat/folders/create", async (request) => {
        const body = (request.body || {});
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
        const folder = {
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
        const body = (request.body || {});
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
        const body = (request.body || {});
        const userId = body.userId?.trim();
        if (!userId) {
            throw new Error("userId is required");
        }
        const store = await loadChatStore();
        const user = getUserBucket(store, userId);
        return ok({ folders: user.folders });
    });
    app.post("/api/chat/sessions/create", async (request) => {
        const body = (request.body || {});
        const userId = body.userId?.trim();
        if (!userId) {
            throw new Error("userId is required");
        }
        const title = (body.title && String(body.title).trim()) || "New chat";
        const folderId = body.folderId?.trim() || null;
        const threadId = (body.threadId && String(body.threadId).trim()) || `api-session-${Date.now()}`;
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const now = new Date().toISOString();
        const store = await loadChatStore();
        const user = getUserBucket(store, userId);
        if (folderId && !user.folders.find((f) => f.id === folderId)) {
            throw new Error("folderId does not exist for this user");
        }
        const session = {
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
        const body = (request.body || {});
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
        if (body.hasOwnProperty("folderId")) {
            const folderId = body.folderId === null ? null : body.folderId?.trim() || null;
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
        const body = (request.body || {});
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
        const body = (request.body || {});
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
                folderId: s.folderId || null,
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
        const body = (request.body || {});
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
    app.post("/api/agent/message", async (request) => {
        const body = (request.body || {});
        const threadId = body.threadId?.trim() || "api-session-1";
        const message = body.message?.trim();
        if (!message) {
            throw new Error("message is required");
        }
        const invokeConfig = {
            configurable: { thread_id: threadId }
        };
        const result = await agentGraphCRAGSelfRAG_1.graph.invoke({ messages: [new messages_1.HumanMessage(message)] }, invokeConfig);
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
        const fields = file.fields || {};
        const getFieldValue = (name) => {
            const field = fields[name];
            if (!field)
                return undefined;
            if (Array.isArray(field)) {
                const first = field[0];
                if (first && typeof first === "object" && "value" in first) {
                    return first.value;
                }
                return first;
            }
            if (typeof field === "object" && field !== null && "value" in field) {
                return field.value;
            }
            return field;
        };
        const rawThreadId = getFieldValue("threadId");
        const rawMessage = getFieldValue("message");
        const threadId = (rawThreadId && String(rawThreadId).trim()) || "api-session-1";
        const message = rawMessage && String(rawMessage).trim();
        if (!message) {
            throw new Error("message is required");
        }
        const tempPath = await writeMultipartToTemp(file);
        try {
            await ingestionService_1.ingestionService.ingestDocument(tempPath);
            const invokeConfig = {
                configurable: { thread_id: threadId }
            };
            const result = await agentGraphCRAGSelfRAG_1.graph.invoke({ messages: [new messages_1.HumanMessage(message)] }, invokeConfig);
            const responseText = getAssistantText(result);
            return ok({
                threadId,
                response: responseText,
                source: "file",
                fileName: file.filename || null
            });
        }
        finally {
            await fs_1.default.promises.unlink(tempPath).catch(() => undefined);
        }
    });
    app.post("/api/agent/decision", async (request) => {
        const body = (request.body || {});
        const threadId = body.threadId?.trim() || "api-session-1";
        const decision = body.decision?.trim();
        if (!decision) {
            throw new Error("decision is required");
        }
        const message = mapDecisionToMessage(decision, body.calendarAuthCode);
        const invokeConfig = {
            configurable: { thread_id: threadId }
        };
        const result = await agentGraphCRAGSelfRAG_1.graph.invoke({ messages: [new messages_1.HumanMessage(message)] }, invokeConfig);
        return ok({
            threadId,
            response: getAssistantText(result)
        });
    });
    app.post("/api/rag/initialize", async () => {
        await ingestionService_1.ingestionService.initialize();
        return ok({ initialized: true });
    });
    app.post("/api/rag/query", async (request) => {
        const body = (request.body || {});
        const query = body.query?.trim();
        if (!query) {
            throw new Error("query is required");
        }
        const topK = body.topK && body.topK > 0 ? body.topK : 5;
        const context = await ingestionService_1.ingestionService.query(query, topK);
        return ok({ query, topK, context });
    });
    app.post("/api/rag/ingest/file", async (request) => {
        const file = await request.file();
        if (!file) {
            throw new Error("file is required (multipart/form-data)");
        }
        const tempPath = await writeMultipartToTemp(file);
        try {
            const result = await ingestionService_1.ingestionService.ingestDocument(tempPath);
            return ok(result);
        }
        finally {
            await fs_1.default.promises.unlink(tempPath).catch(() => undefined);
        }
    });
    app.post("/api/rag/ingest/directory", async (request) => {
        const body = (request.body || {});
        const directoryPath = body.directoryPath?.trim();
        if (!directoryPath) {
            throw new Error("directoryPath is required");
        }
        const results = await ingestionService_1.ingestionService.ingestDirectory(directoryPath, body.chunkSize || 1000, body.overlap || 200);
        return ok(results);
    });
    app.post("/api/search/web", async (request) => {
        const body = (request.body || {});
        const query = body.query?.trim();
        if (!query) {
            throw new Error("query is required");
        }
        const result = await searchTool_1.webSearchTool.invoke(query);
        return ok(parseMaybeJson(result));
    });
    app.get("/api/calendar/upcoming", async () => {
        const result = await calendarTool_1.getUpcomingEventsTool.invoke({});
        return ok(result);
    });
    app.post("/api/calendar/by-date", async (request) => {
        const body = (request.body || {});
        if (!body.input?.trim()) {
            throw new Error("input is required (example: 'tomorrow' or 'next monday')");
        }
        const result = await calendarTool_1.getEventsForDateTool.invoke(body.input);
        return ok(result);
    });
    app.post("/api/calendar/create", async (request) => {
        const result = await calendarTool_1.createEventTool.invoke((request.body || {}));
        return ok(result);
    });
    app.post("/api/calendar/update", async (request) => {
        const result = await calendarTool_1.updateEventTool.invoke((request.body || {}));
        return ok(result);
    });
    app.post("/api/calendar/cancel", async (request) => {
        const result = await calendarTool_1.cancelEventTool.invoke((request.body || {}));
        return ok(result);
    });
    app.post("/api/calendar/add-attendees", async (request) => {
        const result = await calendarTool_1.addAttendeesTool.invoke((request.body || {}));
        return ok(result);
    });
    app.post("/api/calendar/notify-attendees", async (request) => {
        const result = await calendarTool_1.notifyAttendeesTool.invoke((request.body || {}));
        return ok(result);
    });
    app.get("/api/calendar/auth/url", async () => {
        return ok({ authUrl: (0, googleCalendar_1.getCalendarAuthUrl)() });
    });
    app.post("/api/calendar/auth/exchange-code", async (request) => {
        const body = (request.body || {});
        if (!body.code?.trim()) {
            throw new Error("code is required");
        }
        const tokens = await (0, googleCalendar_1.exchangeAuthCode)(body.code.trim());
        return ok(tokens);
    });
    app.post("/api/calendar/auth/set-tokens", async (request) => {
        const body = (request.body || {});
        if (!body.accessToken?.trim()) {
            throw new Error("accessToken is required");
        }
        (0, googleCalendar_1.setCredentials)(body.accessToken.trim(), (body.refreshToken || "").trim());
        return ok({ configured: true });
    });
    app.post("/api/jira/issues/create", async (request) => {
        const result = await jiraTool_1.createJiraIssueTool.invoke((request.body || {}));
        return ok(parseMaybeJson(result));
    });
    app.post("/api/jira/issues/update", async (request) => {
        const result = await jiraTool_1.updateJiraIssueTool.invoke((request.body || {}));
        return ok(parseMaybeJson(result));
    });
    app.post("/api/jira/issues/list", async (request) => {
        const result = await jiraTool_1.listJiraIssuesTool.invoke((request.body || {}));
        return ok(parseMaybeJson(result));
    });
    app.post("/api/jira/issues/list-all", async (request) => {
        const result = await jiraTool_1.listJiraIssuesAllTool.invoke((request.body || {}));
        return ok(parseMaybeJson(result));
    });
    app.post("/api/jira/issues/counts", async (request) => {
        const result = await jiraTool_1.jiraIssueCountsTool.invoke((request.body || {}));
        return ok(parseMaybeJson(result));
    });
    app.post("/api/language/detect", async (request) => {
        const body = (request.body || {});
        if (!body.text?.trim()) {
            throw new Error("text is required");
        }
        const language = await (0, translation_1.detectLanguage)(body.text);
        return ok({ language });
    });
    app.post("/api/language/translate", async (request) => {
        const body = (request.body || {});
        if (!body.text?.trim()) {
            throw new Error("text is required");
        }
        if (!body.targetLang?.trim()) {
            throw new Error("targetLang is required");
        }
        const translated = await (0, translation_1.translateText)(body.text, body.targetLang, body.sourceLang);
        return ok({ translated });
    });
    app.post("/api/voice/transcribe", async (request) => {
        const file = await request.file();
        if (!file) {
            throw new Error("audio file is required (multipart/form-data)");
        }
        const ext = path_1.default.extname(file.filename || "") || ".wav";
        const tempPath = await writeMultipartToTemp(file, ext);
        try {
            const text = await (0, voice_1.transcribeAudio)(tempPath);
            return ok({ text });
        }
        finally {
            await fs_1.default.promises.unlink(tempPath).catch(() => undefined);
        }
    });
    app.post("/api/voice/synthesize", async (request, reply) => {
        const body = (request.body || {});
        const text = body.text?.trim();
        if (!text) {
            throw new Error("text is required");
        }
        const speechFilePath = await (0, voice_1.synthesizeSpeech)(text, (body.language || "en").trim());
        const buffer = await fs_1.default.promises.readFile(speechFilePath);
        await fs_1.default.promises.unlink(speechFilePath).catch(() => undefined);
        reply.header("Content-Type", "audio/mpeg");
        reply.header("Content-Disposition", "inline; filename=tts.mp3");
        return reply.send(buffer);
    });
    app.post("/api/knowledge/query", async (request) => {
        const body = (request.body || {});
        const query = body.query?.trim();
        if (!query) {
            throw new Error("query is required");
        }
        const result = await knowledgeBaseTool_1.knowledgeBaseTool.invoke({ query });
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
