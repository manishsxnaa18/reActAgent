"use strict";
/**
 * Document Ingestion CLI
 * Command-line interface for uploading and processing company documents
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const readline_1 = __importDefault(require("readline"));
const fs = __importStar(require("fs"));
const ingestionService_1 = require("./rag/ingestionService");
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout
});
function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}
async function initializeSystem() {
    console.log("\n=== Company Knowledge Base - Document Ingestion ===\n");
    try {
        await ingestionService_1.ingestionService.initialize();
    }
    catch (error) {
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
    const result = await ingestionService_1.ingestionService.ingestDocument(filePath);
    if (result.success) {
        console.log(`\n✅ Successfully processed: ${result.fileName}`);
        console.log(`   Chunks created: ${result.chunksProcessed}`);
    }
    else {
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
    const results = await ingestionService_1.ingestionService.ingestDirectory(dirPath);
    console.log("\n📊 Ingestion Summary:");
    results.forEach(result => {
        const status = result.success ? "✅" : "❌";
        console.log(`${status} ${result.fileName} - ${result.chunksProcessed} chunks`);
    });
}
async function testQuery() {
    const query = await question("\nEnter your question: ");
    const context = await ingestionService_1.ingestionService.query(query, 3);
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
