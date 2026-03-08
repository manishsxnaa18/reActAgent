/**
 * Setup Verification Script
 * Checks that all required dependencies and environment variables are configured
 */

import "dotenv/config";
import * as fs from "fs";

interface CheckResult {
  name: string;
  status: "✅" | "⚠️" | "❌";
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, condition: boolean, successMsg: string, failMsg: string): void {
  results.push({
    name,
    status: condition ? "✅" : "❌",
    message: condition ? successMsg : failMsg
  });
}

function checkOptional(name: string, condition: boolean, successMsg: string, notSetMsg: string): void {
  results.push({
    name,
    status: condition ? "✅" : "⚠️",
    message: condition ? successMsg : notSetMsg
  });
}

console.log("\n🔍 Verifying ReAct Agent Setup...\n");

// Check required environment variables
check(
  "OpenAI API Key",
  !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"),
  "OpenAI API key is set",
  "OPENAI_API_KEY is missing or invalid. Get one from https://platform.openai.com/api-keys"
);

const vectorProvider = (process.env.VECTOR_STORE_PROVIDER || "pinecone").toLowerCase();
results.push({
  name: "Vector Store Provider",
  status: vectorProvider === "qdrant" || vectorProvider === "pinecone" ? "✅" : "⚠️",
  message:
    vectorProvider === "qdrant" || vectorProvider === "pinecone"
      ? `Using provider: ${vectorProvider}`
      : `Unknown provider: ${vectorProvider} (defaulting to pinecone)`
});

if (vectorProvider === "qdrant") {
  checkOptional(
    "Qdrant URL",
    !!process.env.QDRANT_URL,
    `Qdrant URL: ${process.env.QDRANT_URL}`,
    "QDRANT_URL not set (defaulting to http://localhost:6333)"
  );

  checkOptional(
    "Qdrant API Key",
    !!process.env.QDRANT_API_KEY,
    "Qdrant API key is set",
    "QDRANT_API_KEY not set (optional for local Qdrant)"
  );
} else {
  check(
    "Pinecone API Key",
    !!process.env.PINECONE_API_KEY && process.env.PINECONE_API_KEY.length > 0,
    "Pinecone API key is set",
    "PINECONE_API_KEY is missing. Get one from https://www.pinecone.io/"
  );
}

check(
  "Tavily API Key",
  !!process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.startsWith("tvly-"),
  "Tavily API key is set",
  "TAVILY_API_KEY is missing or invalid. Get one from https://tavily.com/api/"
);

// Optional Google Calendar tokens
checkOptional(
  "Google Access Token",
  !!process.env.GOOGLE_ACCESS_TOKEN,
  "Google Calendar is configured",
  "Google Calendar not configured (optional). Calendar tools will not work."
);

checkOptional(
  "Google Refresh Token",
  !!process.env.GOOGLE_REFRESH_TOKEN,
  "Google Refresh Token is set",
  "Google Refresh Token not set (optional)"
);

// Check model configuration
const model = process.env.DEFAULT_MODEL || "gpt-5-mini";
results.push({
  name: "Default Model",
  status: "✅",
  message: `Using model: ${model}`
});

// Check if uploads directory exists
check(
  "Uploads Directory",
  fs.existsSync("./uploads"),
  "Uploads directory exists",
  "Uploads directory missing. Creating..."
);

if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

// Check for sample documents
const uploadFiles = fs.existsSync("./uploads") ? fs.readdirSync("./uploads") : [];
const sampleDocs = uploadFiles.filter(f => 
  f.endsWith(".txt") || f.endsWith(".pdf") || f.endsWith(".csv") || 
  f.endsWith(".xlsx") || f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png")
);

results.push({
  name: "Sample Documents",
  status: sampleDocs.length > 0 ? "✅" : "⚠️",
  message: sampleDocs.length > 0 
    ? `Found ${sampleDocs.length} sample document(s)` 
    : "No documents in uploads/ folder. Add some to test RAG!"
});

// Check if node_modules exists
check(
  "Dependencies",
  fs.existsSync("./node_modules"),
  "Dependencies installed",
  "Dependencies not installed. Run: npm install"
);

// Print results
console.log("═".repeat(70));
results.forEach(result => {
  console.log(`${result.status} ${result.name.padEnd(25)} ${result.message}`);
});
console.log("═".repeat(70));

// Summary
const criticalIssues = results.filter(r => r.status === "❌").length;
const warnings = results.filter(r => r.status === "⚠️").length;
const passed = results.filter(r => r.status === "✅").length;

console.log(`\n📊 Summary: ${passed} passed, ${warnings} warnings, ${criticalIssues} critical issues\n`);

if (criticalIssues > 0) {
  console.log("❌ Critical issues found! Please fix the issues above before running the agent.\n");
  process.exit(1);
} else if (warnings > 0) {
  console.log("⚠️  Some optional features are not configured. The agent will work but with limited functionality.\n");
  console.log("✅ You can proceed with: npm run dev\n");
} else {
  console.log("✅ All checks passed! You're ready to go!\n");
  console.log("Next steps:");
  console.log("  1. Run: npm run ingest   (to load documents into RAG)");
  console.log("  2. Run: npm run dev      (to start the agent)\n");
}
