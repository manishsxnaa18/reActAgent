import "dotenv/config";
import readline from "readline";
import { graph } from "./graph/agentGraph";
import { HumanMessage, BaseMessage } from "@langchain/core/messages";
import { 
  setCredentials 
} from "./tools/googleCalendar";

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
  console.log("LangGraph Agent with Memory + Tools");
  console.log("Type 'exit' to quit.\n");

  const threadId = "cli-session-1";

  while (true) {
    const input = await promptUser("You: ");

    if (input === "exit") {
      rl.close();
      break;
    }

    const result = await graph.invoke(
      {
        messages: [new HumanMessage(input)] as BaseMessage[]
      },
      {
        configurable: { thread_id: threadId }
      }
    );

    const lastMessage =
      result.messages[result.messages.length - 1];

    console.log("\n🤖", lastMessage.content, "\n");
  }
}

start();
