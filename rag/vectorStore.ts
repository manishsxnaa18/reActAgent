/**
 * Vector Store Integration
 * Supports Pinecone and Qdrant for RAG system
 */

import { PineconeVectorStore } from "./vectorStores/pineconeVectorStore";
import { QdrantVectorStore } from "./vectorStores/qdrantVectorStore";
import { VectorStore } from "./vectorStores/types";

function getVectorStoreProvider(): "pinecone" | "qdrant" {
  const provider = (process.env.VECTOR_STORE_PROVIDER || "pinecone").toLowerCase();
  return provider === "qdrant" ? "qdrant" : "pinecone";
}

// Export singleton instance
export const vectorStore: VectorStore =
  getVectorStoreProvider() === "qdrant"
    ? new QdrantVectorStore()
    : new PineconeVectorStore();

export type { SearchResult, VectorRecord, VectorStore } from "./vectorStores/types";
