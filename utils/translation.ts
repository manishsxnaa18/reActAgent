import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const translationModel = new ChatOpenAI({
  model: process.env.TRANSLATION_MODEL || process.env.OPENAI_MODEL || process.env.DEFAULT_MODEL || "gpt-4o-mini",
  temperature: 0
});

function normalizeLanguageCode(code: string): string {
  const normalized = code.trim().toLowerCase();
  const match = normalized.match(/^[a-z]{2}(-[a-z]{2})?$/);
  return match ? match[0].split("-")[0] : "en";
}

export async function detectLanguage(text: string): Promise<string> {
  if (!text.trim()) return "en";

  const response = await translationModel.invoke([
    new SystemMessage(
      "Detect the language of the text. Reply with ONLY the ISO 639-1 code (e.g., en, es, hi)."
    ),
    new HumanMessage(text)
  ]);

  const content = typeof response.content === "string" ? response.content : "en";
  return normalizeLanguageCode(content);
}

export async function translateText(text: string, targetLang: string, sourceLang?: string): Promise<string> {
  if (!text.trim()) return text;

  const sourceDescriptor = sourceLang ? `from ${sourceLang} ` : "";
  const response = await translationModel.invoke([
    new SystemMessage(
      `Translate the following text ${sourceDescriptor}to ${targetLang}. Return ONLY the translated text.`
    ),
    new HumanMessage(text)
  ]);

  return typeof response.content === "string" ? response.content : text;
}
