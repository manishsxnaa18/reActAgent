import { DocumentChunk } from "../documentParsers";

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: {
    text: string;
    source: string;
    chunkIndex: number;
    fileType: string;
    timestamp: string;
    [key: string]: any;
  };
}

export interface SearchResult {
  id: string;
  score: number;
  text: string;
  metadata: {
    source: string;
    chunkIndex: number;
    fileType: string;
    [key: string]: any;
  };
}

export interface VectorStore {
  initializeIndex(dimension: number): Promise<void>;
  upsertDocuments(chunks: DocumentChunk[]): Promise<void>;
  search(query: string, topK?: number): Promise<SearchResult[]>;
  deleteAll(): Promise<void>;
  deleteBySource(source: string): Promise<void>;
}
