"use strict";
/**
 * OpenAI Embeddings Service
 * Handles text embedding for RAG system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.embeddingService = exports.EmbeddingService = void 0;
const openai_1 = require("@langchain/openai");
/**
 * Initialize OpenAI Embeddings
 * Uses model specified in environment variable OPENAI_EMBEDDING_MODEL or defaults to text-embedding-3-large
 */
class EmbeddingService {
    constructor(modelName = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large") {
        this.embeddings = new openai_1.OpenAIEmbeddings({
            modelName: modelName,
            openAIApiKey: process.env.OPENAI_API_KEY,
            dimensions: 1024
        });
    }
    /**
     * Generate embedding for a single text
     */
    async embedText(text) {
        const result = await this.embeddings.embedQuery(text);
        return result;
    }
    /**
     * Generate embeddings for multiple texts (batch)
     */
    async embedBatch(texts) {
        const results = await this.embeddings.embedDocuments(texts);
        return results;
    }
    /**
     * Get embedding dimension
     */
    async getEmbeddingDimension() {
        // text-embedding-3-small has 1536 dimensions
        // text-embedding-3-large has 3072 dimensions
        const sampleEmbedding = await this.embedText("sample");
        return sampleEmbedding.length;
    }
}
exports.EmbeddingService = EmbeddingService;
// Export singleton instance
exports.embeddingService = new EmbeddingService();
