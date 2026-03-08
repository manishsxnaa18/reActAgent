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
