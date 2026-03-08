"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLanguage = detectLanguage;
exports.translateText = translateText;
const openai_1 = require("@langchain/openai");
const messages_1 = require("@langchain/core/messages");
const translationModel = new openai_1.ChatOpenAI({
    model: process.env.TRANSLATION_MODEL || process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || "gpt-4o-mini",
    temperature: 0
});
function normalizeLanguageCode(code) {
    const normalized = code.trim().toLowerCase();
    const match = normalized.match(/^[a-z]{2}(-[a-z]{2})?$/);
    return match ? match[0].split("-")[0] : "en";
}
async function detectLanguage(text) {
    if (!text.trim())
        return "en";
    const response = await translationModel.invoke([
        new messages_1.SystemMessage("Detect the language of the text. Reply with ONLY the ISO 639-1 code (e.g., en, es, hi)."),
        new messages_1.HumanMessage(text)
    ]);
    const content = typeof response.content === "string" ? response.content : "en";
    return normalizeLanguageCode(content);
}
async function translateText(text, targetLang, sourceLang) {
    if (!text.trim())
        return text;
    const sourceDescriptor = sourceLang ? `from ${sourceLang} ` : "";
    const response = await translationModel.invoke([
        new messages_1.SystemMessage(`Translate the following text ${sourceDescriptor}to ${targetLang}. Return ONLY the translated text.`),
        new messages_1.HumanMessage(text)
    ]);
    return typeof response.content === "string" ? response.content : text;
}
