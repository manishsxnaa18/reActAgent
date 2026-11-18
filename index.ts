import "./loadEnv";
import readline from "readline";
import { graph } from "./graph/agentGraphCRAGSelfRAG";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { 
  setCredentials 
} from "./tools/googleCalendar";
//import "./instrumentation";
// import { CallbackHandler } from "@langfuse/langchain";
import { RunnableConfig } from "@langchain/core/runnables";
import { detectLanguage, translateText } from "./utils/translation";
import { recordAudioToFile, transcribeAudio, synthesizeSpeech, playAudioFile, createTempAudioPath } from "./utils/voice";

const AGENT_NAME = process.env.AGENT_NAME || "Meera";
const capabilityBanner = `💡 Meet ${AGENT_NAME}! She can:\n- Search company knowledge (policies, finances, product docs)\n- Manage your Google Calendar (create/update/cancel/send invites)\n- Search the web for fresh information`;

 
const langfuseEnabled = process.env.LANGFUSE_ENABLED?.toLowerCase() === "true";
//const langfuseHandler = langfuseEnabled ? new CallbackHandler() : null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function start() {
  const GOOGLE_ACCESS_TOKEN = process.env.GOOGLE_ACCESS_TOKEN || "";
  const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || "";
  
  if (GOOGLE_ACCESS_TOKEN && GOOGLE_REFRESH_TOKEN) {
    setCredentials(GOOGLE_ACCESS_TOKEN, GOOGLE_REFRESH_TOKEN);
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
      const audioPath = createTempAudioPath("wav");

      console.log(`\n🎙️ Recording for ${recordSeconds} seconds...`);
      await recordAudioToFile(audioPath, recordSeconds);
      console.log("📝 Transcribing...");
      rawInput = await transcribeAudio(audioPath);
      console.log(`You (transcribed): ${rawInput}\n`);
    }

    if (!rawInput) {
      console.log("\n⚠️ No input received.\n");
      continue;
    }

    const invokeConfig: RunnableConfig = {
      configurable: { thread_id: threadId }
    };

    // if (langfuseHandler) {
    //   invokeConfig.callbacks = [langfuseHandler];
    //   invokeConfig.metadata = { langfuseSessionId: threadId };
    // }

    const detectedLanguage = await detectLanguage(rawInput);
    const englishInput = detectedLanguage === "en"
      ? rawInput
      : await translateText(rawInput, "en", detectedLanguage);

    const result = await graph.invoke(
      {
        messages: [new HumanMessage(englishInput)] as BaseMessage[]
      },
      invokeConfig
    );

    const lastMessage =
      result.messages[result.messages.length - 1];

    let outputText = typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content);

    if (detectedLanguage !== "en") {
      outputText = await translateText(outputText, detectedLanguage, "en");
    }

    console.log("\n🤖", outputText, "\n");

    if (usedVoiceInput) {
      try {
        const speechPath = await synthesizeSpeech(outputText, detectedLanguage);
        await playAudioFile(speechPath);
      } catch (error) {
        console.log("⚠️ Voice output failed:", error instanceof Error ? error.message : String(error));
      }
    }
  }
}

start();
