/**
 * OpenAI Embeddings Service
 * Handles text embedding for RAG system
 */

import { OpenAIEmbeddings } from "@langchain/openai";

export interface EmbeddingResult {
  embedding: number[];
  text: string;
}

/**
 * Initialize OpenAI Embeddings
 * Uses model specified in environment variable OPENAI_EMBEDDING_MODEL or defaults to text-embedding-3-large
 */
export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;
  
  constructor(modelName: string = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large") {
    this.embeddings = new OpenAIEmbeddings({
      modelName: modelName,
      openAIApiKey: process.env.OPENAI_API_KEY,
      dimensions: 1024
    });
  }
  
  /**
   * Generate embedding for a single text
   */
  async embedText(text: string): Promise<number[]> {
    const result = await this.embeddings.embedQuery(text);
    return result;
  }
  
  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results = await this.embeddings.embedDocuments(texts);
    return results;
  }
  
  /**
   * Get embedding dimension
   */
  async getEmbeddingDimension(): Promise<number> {
    // text-embedding-3-small has 1536 dimensions
    // text-embedding-3-large has 3072 dimensions
    const sampleEmbedding = await this.embedText("sample");
    return sampleEmbedding.length;
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
