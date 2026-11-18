/**
 * Document Ingestion CLI
 * Command-line interface for uploading and processing company documents
 */

import "./loadEnv";
import readline from "readline";
import * as fs from "fs";
import * as path from "path";
import { ingestionService } from "./rag/ingestionService";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function initializeSystem() {
  console.log("\n=== Company Knowledge Base - Document Ingestion ===\n");
  
  try {
    await ingestionService.initialize();
  } catch (error) {
    console.error("❌ Failed to initialize RAG system:", error);
    console.log("\n⚠️  Make sure you have set the following environment variables:");
    console.log("   - OPENAI_API_KEY");
    console.log("   - VECTOR_STORE_PROVIDER (pinecone|qdrant)");
    console.log("   - PINECONE_API_KEY (if using pinecone)");
    console.log("   - QDRANT_URL (if using qdrant, default: http://localhost:6333)");
    process.exit(1);
  }
}

async function ingestSingleFile() {
  const filePath = await question("\nEnter the full path to the document: ");
  
  if (!fs.existsSync(filePath)) {
    console.log("❌ File not found!");
    return;
  }
  
  const result = await ingestionService.ingestDocument(filePath);
  
  if (result.success) {
    console.log(`\n✅ Successfully processed: ${result.fileName}`);
    console.log(`   Chunks created: ${result.chunksProcessed}`);
  } else {
    console.log(`\n❌ Failed to process: ${result.fileName}`);
    console.log(`   Error: ${result.error}`);
  }
}

async function ingestDirectory() {
  const dirPath = await question("\nEnter the directory path containing documents: ");
  
  if (!fs.existsSync(dirPath)) {
    console.log("❌ Directory not found!");
    return;
  }
  
  const results = await ingestionService.ingestDirectory(dirPath);
  
  console.log("\n📊 Ingestion Summary:");
  results.forEach(result => {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.fileName} - ${result.chunksProcessed} chunks`);
  });
}

async function testQuery() {
  const query = await question("\nEnter your question: ");
  
  const context = await ingestionService.query(query, 3);
  
  console.log("\n📚 Knowledge Base Results:");
  console.log("─".repeat(60));
  console.log(context);
  console.log("─".repeat(60));
}

async function showMenu() {
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║   Company Knowledge Base - Main Menu      ║");
  console.log("╚════════════════════════════════════════════╝");
  console.log("\n1. Ingest a single document");
  console.log("2. Ingest all documents from a directory");
  console.log("3. Test query the knowledge base");
  console.log("4. Exit");
  
  const choice = await question("\nSelect an option (1-4): ");
  
  switch (choice) {
    case "1":
      await ingestSingleFile();
      await showMenu();
      break;
    
    case "2":
      await ingestDirectory();
      await showMenu();
      break;
    
    case "3":
      await testQuery();
      await showMenu();
      break;
    
    case "4":
      console.log("\n👋 Goodbye!\n");
      rl.close();
      process.exit(0);
      break;
    
    default:
      console.log("❌ Invalid choice");
      await showMenu();
      break;
  }
}

async function main() {
  await initializeSystem();
  await showMenu();
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
