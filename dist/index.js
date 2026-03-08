"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const readline_1 = __importDefault(require("readline"));
const agentGraphCRAGSelfRAG_1 = require("./graph/agentGraphCRAGSelfRAG");
const messages_1 = require("@langchain/core/messages");
const googleCalendar_1 = require("./tools/googleCalendar");
const translation_1 = require("./utils/translation");
const voice_1 = require("./utils/voice");
const AGENT_NAME = process.env.AGENT_NAME || "Meera";
const capabilityBanner = `💡 Meet ${AGENT_NAME}! She can:\n- Search company knowledge (policies, finances, product docs)\n- Manage your Google Calendar (create/update/cancel/send invites)\n- Search the web for fresh information`;
const langfuseEnabled = process.env.LANGFUSE_ENABLED?.toLowerCase() === "true";
//const langfuseHandler = langfuseEnabled ? new CallbackHandler() : null;
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
function promptUser(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}
async function start() {
    const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || "";
    const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";
    if (GOOGLE_ACCESS_TOKEN && GOOGLE_REFRESH_TOKEN) {
        (0, googleCalendar_1.setCredentials)(GOOGLE_ACCESS_TOKEN, GOOGLE_REFRESH_TOKEN);
    }
    console.log(`LangGraph Agent with Memory + Tools — powered by ${AGENT_NAME}`);
    console.log(capabilityBanner);
    console.log("Type 'exit' to quit. Use '/voice' to speak.\n");
    const threadId = "cli-session-1";
    while (true) {
        const input = await promptUser(`${AGENT_NAME} is listening. You: `);
        if (input === "exit") {
            rl.close();
            break;
        }
        let rawInput = input.trim();
        let usedVoiceInput = false;
        if (rawInput.toLowerCase().startsWith("/voice")) {
            usedVoiceInput = true;
            const secondsArg = rawInput.split(" ").slice(1).join(" ").trim();
            const recordSeconds = Number(secondsArg || process.env.VOICE_RECORD_SECONDS || "8");
            const audioPath = (0, voice_1.createTempAudioPath)("wav");
            console.log(`\n🎙️ Recording for ${recordSeconds} seconds...`);
            await (0, voice_1.recordAudioToFile)(audioPath, recordSeconds);
            console.log("📝 Transcribing...");
            rawInput = await (0, voice_1.transcribeAudio)(audioPath);
            console.log(`You (transcribed): ${rawInput}\n`);
        }
        if (!rawInput) {
            console.log("\n⚠️ No input received.\n");
            continue;
        }
        const invokeConfig = {
            configurable: { thread_id: threadId }
        };
        // if (langfuseHandler) {
        //   invokeConfig.callbacks = [langfuseHandler];
        //   invokeConfig.metadata = { langfuseSessionId: threadId };
        // }
        const detectedLanguage = await (0, translation_1.detectLanguage)(rawInput);
        const englishInput = detectedLanguage === "en"
            ? rawInput
            : await (0, translation_1.translateText)(rawInput, "en", detectedLanguage);
        const result = await agentGraphCRAGSelfRAG_1.graph.invoke({
            messages: [new messages_1.HumanMessage(englishInput)]
        }, invokeConfig);
        const lastMessage = result.messages[result.messages.length - 1];
        let outputText = typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content);
        if (detectedLanguage !== "en") {
            outputText = await (0, translation_1.translateText)(outputText, detectedLanguage, "en");
        }
        console.log("\n🤖", outputText, "\n");
        if (usedVoiceInput) {
            try {
                const speechPath = await (0, voice_1.synthesizeSpeech)(outputText, detectedLanguage);
                await (0, voice_1.playAudioFile)(speechPath);
            }
            catch (error) {
                console.log("⚠️ Voice output failed:", error instanceof Error ? error.message : String(error));
            }
        }
    }
}
start();
