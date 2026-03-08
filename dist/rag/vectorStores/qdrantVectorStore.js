"use strict";
/**
 * Qdrant Vector Store Integration
 * Handles vector storage and retrieval for RAG system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QdrantVectorStore = void 0;
const js_client_rest_1 = require("@qdrant/js-client-rest");
const crypto_1 = require("crypto");
const embeddings_1 = require("../embeddings");
class QdrantVectorStore {
    constructor(collectionName = process.env.QDRANT_COLLECTION_NAME || "company-knowledge") {
        this.client = new js_client_rest_1.QdrantClient({
            url: process.env.QDRANT_URL || "http://localhost:6333",
            apiKey: process.env.QDRANT_API_KEY || undefined
        });
        this.collectionName = collectionName;
    }
    /**
     * Initialize Qdrant collection (call this during setup)
     */
    async initializeIndex(dimension = 1536) {
        try {
            const collections = await this.client.getCollections();
            const exists = collections.collections?.some(col => col.name === this.collectionName);
            if (!exists) {
                console.log(`Creating Qdrant collection: ${this.collectionName}`);
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: dimension,
                        distance: "Cosine"
                    }
                });
            }
        }
        catch (error) {
            console.error("Error initializing Qdrant collection:", error);
            throw error;
        }
    }
    /**
     * Upsert document chunks into Qdrant
     */
    async upsertDocuments(chunks) {
        try {
            const texts = chunks.map(chunk => chunk.content);
            const embeddings = await embeddings_1.embeddingService.embedBatch(texts);
            const points = chunks.map((chunk, idx) => ({
                id: (0, crypto_1.randomUUID)(),
                vector: embeddings[idx],
                payload: {
                    text: chunk.content,
                    source: chunk.metadata.source,
                    chunkIndex: chunk.metadata.chunkIndex,
                    fileType: chunk.metadata.fileType,
                    timestamp: chunk.metadata.timestamp
                }
            }));
            const batchSize = 100;
            for (let i = 0; i < points.length; i += batchSize) {
                const batch = points.slice(i, i + batchSize);
                await this.client.upsert(this.collectionName, {
                    points: batch
                });
            }
            console.log(`✅ Upserted ${points.length} chunks to Qdrant`);
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
            const queryEmbedding = await embeddings_1.embeddingService.embedText(query);
            const searchResults = await this.client.search(this.collectionName, {
                vector: queryEmbedding,
                limit: topK,
                with_payload: true
            });
            const results = (searchResults || []).map(match => {
                const payload = (match.payload || {});
                return {
                    id: String(match.id),
                    score: match.score || 0,
                    text: payload.text || "",
                    metadata: {
                        source: payload.source || "",
                        chunkIndex: payload.chunkIndex || 0,
                        fileType: payload.fileType || ""
                    }
                };
            });
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
            await this.client.delete(this.collectionName, {
                filter: { must: [] }
            });
            console.log("✅ Deleted all vectors from Qdrant");
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
            await this.client.delete(this.collectionName, {
                filter: {
                    must: [
                        {
                            key: "source",
                            match: { value: source }
                        }
                    ]
                }
            });
            console.log(`✅ Deleted vectors for source: ${source}`);
        }
        catch (error) {
            console.error("Error deleting by source:", error);
            throw error;
        }
    }
}
exports.QdrantVectorStore = QdrantVectorStore;
