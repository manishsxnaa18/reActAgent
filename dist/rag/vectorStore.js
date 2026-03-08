"use strict";
/**
 * Vector Store Integration
 * Supports Pinecone and Qdrant for RAG system
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.vectorStore = void 0;
const pineconeVectorStore_1 = require("./vectorStores/pineconeVectorStore");
const qdrantVectorStore_1 = require("./vectorStores/qdrantVectorStore");
function getVectorStoreProvider() {
    const provider = (process.env.VECTOR_STORE_PROVIDER || "pinecone").toLowerCase();
    return provider === "qdrant" ? "qdrant" : "pinecone";
}
// Export singleton instance
exports.vectorStore = getVectorStoreProvider() === "qdrant"
    ? new qdrantVectorStore_1.QdrantVectorStore()
    : new pineconeVectorStore_1.PineconeVectorStore();
