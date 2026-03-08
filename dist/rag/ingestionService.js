"use strict";
/**
 * Document Ingestion Service
 * Orchestrates document processing, embedding, and storage
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingestionService = exports.IngestionService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const documentParsers_1 = require("./documentParsers");
const vectorStore_1 = require("./vectorStore");
const embeddings_1 = require("./embeddings");
class IngestionService {
    constructor(uploadDir = "./uploads") {
        this.uploadDir = uploadDir;
        // Ensure upload directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
    }
    /**
     * Ingest a single document
     */
    async ingestDocument(filePath, chunkSize, overlap) {
        try {
            const fileName = path.basename(filePath);
            const ext = path.extname(filePath).toLowerCase();
            console.log(`\n📄 Processing document: ${fileName}`);
            // Auto-adjust chunk size based on file type
            const finalChunkSize = chunkSize ?? (ext === '.csv' || ext === '.xlsx' || ext === '.xls' ? 3000 : 1000);
            const finalOverlap = overlap ?? (ext === '.csv' || ext === '.xlsx' || ext === '.xls' ? 500 : 200);
            console.log(`  → Chunk size: ${finalChunkSize}, Overlap: ${finalOverlap}`);
            // Step 1: Parse and chunk the document
            console.log("  → Parsing and chunking...");
            const chunks = await (0, documentParsers_1.processDocumentToChunks)(filePath, finalChunkSize, finalOverlap);
            console.log(`  → Created ${chunks.length} chunks`);
            // Step 2: Store in vector database
            console.log("  → Generating embeddings and storing...");
            await vectorStore_1.vectorStore.upsertDocuments(chunks);
            console.log(`✅ Successfully ingested: ${fileName}`);
            return {
                success: true,
                fileName,
                chunksProcessed: chunks.length
            };
        }
        catch (error) {
            console.error(`❌ Error ingesting document:`, error);
            return {
                success: false,
                fileName: path.basename(filePath),
                chunksProcessed: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    /**
     * Ingest multiple documents from a directory
     */
    async ingestDirectory(dirPath, chunkSize = 1000, overlap = 200) {
        const results = [];
        try {
            const files = fs.readdirSync(dirPath);
            const supportedExtensions = [".txt", ".md", ".csv", ".xlsx", ".xls", ".pdf", ".jpg", ".jpeg", ".png"];
            const documentsToProcess = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return supportedExtensions.includes(ext);
            });
            console.log(`\n📚 Found ${documentsToProcess.length} documents to process`);
            for (const file of documentsToProcess) {
                const filePath = path.join(dirPath, file);
                const result = await this.ingestDocument(filePath, chunkSize, overlap);
                results.push(result);
            }
            const successCount = results.filter(r => r.success).length;
            console.log(`\n✅ Ingestion complete: ${successCount}/${results.length} successful`);
            return results;
        }
        catch (error) {
            console.error("Error ingesting directory:", error);
            throw error;
        }
    }
    /**
     * Query the knowledge base
     */
    async query(question, topK = 5) {
        try {
            console.log(`\n🔍 Searching knowledge base: "${question}"`);
            const results = await vectorStore_1.vectorStore.search(question, topK);
            if (results.length === 0) {
                return "No relevant information found in the knowledge base.";
            }
            // Format context from search results
            const context = results
                .map((result, idx) => {
                return `[${idx + 1}] (Score: ${result.score.toFixed(3)}, Source: ${result.metadata.source})\n${result.text}`;
            })
                .join("\n\n");
            console.log(`  → Found ${results.length} relevant chunks`);
            return context;
        }
        catch (error) {
            console.error("Error querying knowledge base:", error);
            throw error;
        }
    }
    /**
     * Initialize the vector store (call once during setup)
     */
    async initialize() {
        console.log("🚀 Initializing RAG system...");
        // Get embedding dimension
        const dimension = await embeddings_1.embeddingService.getEmbeddingDimension();
        console.log(`  → Embedding dimension: ${dimension}`);
        // Initialize vector store (Pinecone or Qdrant)
        await vectorStore_1.vectorStore.initializeIndex(dimension);
        console.log("✅ RAG system initialized");
    }
    /**
     * Get upload directory path
     */
    getUploadDir() {
        return this.uploadDir;
    }
}
exports.IngestionService = IngestionService;
// Export singleton instance
exports.ingestionService = new IngestionService();
