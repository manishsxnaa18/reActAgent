/**
 * Document Ingestion Service
 * Orchestrates document processing, embedding, and storage
 */

import * as fs from "fs";
import * as path from "path";
import { processDocumentToChunks, DocumentChunk } from "./documentParsers";
import { vectorStore } from "./vectorStore";
import { embeddingService } from "./embeddings";

export interface IngestionResult {
  success: boolean;
  fileName: string;
  chunksProcessed: number;
  error?: string;
}

export class IngestionService {
  private uploadDir: string;
  
  constructor(uploadDir: string = "./uploads") {
    this.uploadDir = uploadDir;
    
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
  }
  
  /**
   * Ingest a single document
   */
  async ingestDocument(
    filePath: string,
    chunkSize?: number,
    overlap?: number
  ): Promise<IngestionResult> {
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
      const chunks = await processDocumentToChunks(filePath, finalChunkSize, finalOverlap);
      console.log(`  → Created ${chunks.length} chunks`);
      
      // Step 2: Store in vector database
      console.log("  → Generating embeddings and storing...");
      await vectorStore.upsertDocuments(chunks);
      
      console.log(`✅ Successfully ingested: ${fileName}`);
      
      return {
        success: true,
        fileName,
        chunksProcessed: chunks.length
      };
    } catch (error) {
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
  async ingestDirectory(
    dirPath: string,
    chunkSize: number = 1000,
    overlap: number = 200
  ): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];
    
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
    } catch (error) {
      console.error("Error ingesting directory:", error);
      throw error;
    }
  }
  
  /**
   * Query the knowledge base
   */
  async query(question: string, topK: number = 5): Promise<string> {
    try {
      console.log(`\n🔍 Searching knowledge base: "${question}"`);
      
      const results = await vectorStore.search(question, topK);
      
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
    } catch (error) {
      console.error("Error querying knowledge base:", error);
      throw error;
    }
  }
  
  /**
   * Initialize the vector store (call once during setup)
   */
  async initialize(): Promise<void> {
    console.log("🚀 Initializing RAG system...");
    
    // Get embedding dimension
    const dimension = await embeddingService.getEmbeddingDimension();
    console.log(`  → Embedding dimension: ${dimension}`);
    
    // Initialize vector store (Pinecone or Qdrant)
    await vectorStore.initializeIndex(dimension);
    
    console.log("✅ RAG system initialized");
  }
  
  /**
   * Get upload directory path
   */
  getUploadDir(): string {
    return this.uploadDir;
  }
}

// Export singleton instance
export const ingestionService = new IngestionService();
