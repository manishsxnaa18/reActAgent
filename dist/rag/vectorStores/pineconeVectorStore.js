"use strict";
/**
 * Pinecone Vector Store Integration
 * Handles vector storage and retrieval for RAG system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PineconeVectorStore = void 0;
const pinecone_1 = require("@pinecone-database/pinecone");
const embeddings_1 = require("../embeddings");
class PineconeVectorStore {
    constructor(indexName = process.env.PINECONE_INDEX_NAME || "company-knowledge") {
        this.client = new pinecone_1.Pinecone({
            apiKey: process.env.PINECONE_API_KEY || ""
        });
        this.indexName = indexName;
    }
    /**
     * Initialize Pinecone index (call this during setup)
     */
    async initializeIndex(dimension = 1536) {
        try {
            // Check if index exists
            const indexes = await this.client.listIndexes();
            const indexExists = indexes.indexes?.some(idx => idx.name === this.indexName);
            if (!indexExists) {
                console.log(`Creating Pinecone index: ${this.indexName}`);
                await this.client.createIndex({
                    name: this.indexName,
                    dimension: dimension,
                    metric: "cosine",
                    spec: {
                        serverless: {
                            cloud: "aws",
                            region: "us-east-1"
                        }
                    }
                });
                // Wait for index to be ready
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
        catch (error) {
            console.error("Error initializing Pinecone index:", error);
            throw error;
        }
    }
    /**
     * Upsert document chunks into Pinecone
     */
    async upsertDocuments(chunks) {
        try {
            const index = this.client.index(this.indexName);
            // Generate embeddings for all chunks
            const texts = chunks.map(chunk => chunk.content);
            const embeddings = await embeddings_1.embeddingService.embedBatch(texts);
            // Prepare records for Pinecone
            const records = chunks.map((chunk, idx) => ({
                id: `${chunk.metadata.source}_chunk_${chunk.metadata.chunkIndex}_${Date.now()}`,
                values: embeddings[idx],
                metadata: {
                    text: chunk.content,
                    source: chunk.metadata.source,
                    chunkIndex: chunk.metadata.chunkIndex,
                    fileType: chunk.metadata.fileType,
                    timestamp: chunk.metadata.timestamp
                }
            }));
            // Upsert in batches of 100 (Pinecone limit)
            const batchSize = 100;
            for (let i = 0; i < records.length; i += batchSize) {
                const batch = records.slice(i, i + batchSize);
                await index.upsert(batch);
            }
            console.log(`✅ Upserted ${records.length} chunks to Pinecone`);
        }
        catch (error) {
            console.error("Error upserting documents:", error);
            throw error;
        }
    }
    /**
     * Search for similar documents
     */
    async search(query, topK = 5) {
        try {
            const index = this.client.index(this.indexName);
            // Generate embedding for query
            const queryEmbedding = await embeddings_1.embeddingService.embedText(query);
            // Search Pinecone
            const searchResults = await index.query({
                vector: queryEmbedding,
                topK: topK,
                includeMetadata: true
            });
            // Format results
            const results = (searchResults.matches || []).map(match => ({
                id: match.id,
                score: match.score || 0,
                text: match.metadata?.text || "",
                metadata: {
                    source: match.metadata?.source || "",
                    chunkIndex: match.metadata?.chunkIndex || 0,
                    fileType: match.metadata?.fileType || ""
                }
            }));
            return results;
        }
        catch (error) {
            console.error("Error searching documents:", error);
            throw error;
        }
    }
    /**
     * Delete all vectors (for testing/reset)
     */
    async deleteAll() {
        try {
            const index = this.client.index(this.indexName);
            await index.deleteAll();
            console.log("✅ Deleted all vectors from Pinecone");
        }
        catch (error) {
            console.error("Error deleting vectors:", error);
            throw error;
        }
    }
    /**
     * Delete vectors by source file
     */
    async deleteBySource(source) {
        try {
            const index = this.client.index(this.indexName);
            // Pinecone requires delete by ID, so we need to query first
            // This is a limitation - in production, consider storing IDs separately
            await index.deleteMany({
                filter: { source: { $eq: source } }
            });
            console.log(`✅ Deleted vectors for source: ${source}`);
        }
        catch (error) {
            console.error("Error deleting by source:", error);
            throw error;
        }
    }
}
exports.PineconeVectorStore = PineconeVectorStore;
