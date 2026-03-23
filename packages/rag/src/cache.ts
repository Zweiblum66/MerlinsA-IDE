import type { TheIdeDatabase } from "@the-ide/db";
import { Embedder, computeCosineSimilarity } from "./embedder.js";
import type { RetrievalResult } from "./retriever.js";

const DEFAULT_TTL_SECONDS = 3600;
const SIMILARITY_THRESHOLD = 0.95;

interface CacheEntry {
  queryEmbedding: Float32Array;
  results: RetrievalResult[];
  filePaths: Set<string>;
  createdAt: number;
}

export class SemanticCache {
  private db: TheIdeDatabase;
  private embedder: Embedder;
  private ttlMs: number;
  private cache: Map<string, CacheEntry>;

  constructor(db: TheIdeDatabase, embedder: Embedder, ttlSeconds: number = DEFAULT_TTL_SECONDS) {
    this.db = db;
    this.embedder = embedder;
    this.ttlMs = ttlSeconds * 1000;
    this.cache = new Map();
  }

  async get(query: string): Promise<RetrievalResult[] | null> {
    this.evictExpired();

    const queryEmbedding = this.embedder.generateQueryEmbedding(query);

    for (const [, entry] of this.cache) {
      const similarity = computeCosineSimilarity(queryEmbedding, entry.queryEmbedding);
      if (similarity >= SIMILARITY_THRESHOLD) {
        return entry.results;
      }
    }

    return null;
  }

  async set(query: string, results: RetrievalResult[]): Promise<void> {
    const queryEmbedding = this.embedder.generateQueryEmbedding(query);
    const filePaths = new Set(results.map((r) => r.filePath));

    this.cache.set(query, {
      queryEmbedding,
      results,
      filePaths,
      createdAt: Date.now(),
    });
  }

  invalidate(filePaths: string[]): void {
    const pathSet = new Set(filePaths);
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      for (const cachedPath of entry.filePaths) {
        if (pathSet.has(cachedPath)) {
          keysToDelete.push(key);
          break;
        }
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.ttlMs) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }
}
