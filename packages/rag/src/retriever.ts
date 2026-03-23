import { eq } from "drizzle-orm";
import { codeChunks, embeddings } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { Embedder, computeCosineSimilarity } from "./embedder.js";

export interface RetrievalResult {
  chunkId: string;
  filePath: string;
  name: string;
  content: string;
  score: number;
  matchType: "dense" | "sparse" | "hybrid";
}

const RRF_K = 60;
const DEFAULT_TOP_K = 10;
const CANDIDATE_COUNT = 20;

/**
 * Extract the underlying better-sqlite3 Database instance from a Drizzle DB.
 * This is necessary for FTS5 queries which Drizzle doesn't natively support.
 */
function getSqliteClient(db: TheIdeDatabase): { prepare(sql: string): { all(...params: unknown[]): unknown[] } } {
  return (db as unknown as { session: { client: { prepare(sql: string): { all(...params: unknown[]): unknown[] } } } }).session.client;
}

export class HybridRetriever {
  private db: TheIdeDatabase;
  private embedder: Embedder;

  constructor(db: TheIdeDatabase, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  async retrieve(query: string, projectId: string, topK: number = DEFAULT_TOP_K): Promise<RetrievalResult[]> {
    const [denseResults, sparseResults] = await Promise.all([
      this.denseRetrieval(query, projectId, CANDIDATE_COUNT),
      this.sparseRetrieval(query, projectId, CANDIDATE_COUNT),
    ]);

    return this.reciprocalRankFusion(denseResults, sparseResults, topK);
  }

  private async denseRetrieval(
    query: string,
    projectId: string,
    topN: number,
  ): Promise<RetrievalResult[]> {
    const queryEmbedding = this.embedder.generateQueryEmbedding(query);

    // Fetch all chunks with embeddings for the project
    const rows = this.db
      .select({
        chunkId: codeChunks.id,
        filePath: codeChunks.filePath,
        name: codeChunks.name,
        content: codeChunks.content,
        vector: embeddings.vector,
      })
      .from(codeChunks)
      .innerJoin(embeddings, eq(codeChunks.id, embeddings.chunkId))
      .where(eq(codeChunks.projectId, projectId))
      .all();

    const scored: RetrievalResult[] = [];
    for (const row of rows) {
      const buffer = row.vector as Buffer;
      const storedVector = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4,
      );
      const similarity = computeCosineSimilarity(queryEmbedding, storedVector);

      scored.push({
        chunkId: row.chunkId,
        filePath: row.filePath,
        name: row.name,
        content: row.content,
        score: similarity,
        matchType: "dense",
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topN);
  }

  private async sparseRetrieval(
    query: string,
    projectId: string,
    topN: number,
  ): Promise<RetrievalResult[]> {
    // Sanitize query for FTS5 MATCH syntax
    const sanitizedQuery = query.replace(/['"]/g, " ").trim();
    if (!sanitizedQuery) return [];

    try {
      const sqlite = getSqliteClient(this.db);

      // Use FTS5 for BM25-based keyword matching
      const ftsRows = sqlite
        .prepare(
          `SELECT name, content, rank
           FROM code_chunks_fts
           WHERE code_chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(sanitizedQuery, topN) as Array<{ name: string; content: string; rank: number }>;

      // Match FTS results back to code_chunks for full metadata
      const results: RetrievalResult[] = [];
      for (const ftsRow of ftsRows) {
        const matchingChunks = this.db
          .select()
          .from(codeChunks)
          .where(eq(codeChunks.projectId, projectId))
          .all();

        const matched = matchingChunks.find(
          (c) => c.name === ftsRow.name && c.content === ftsRow.content,
        );

        if (matched) {
          results.push({
            chunkId: matched.id,
            filePath: matched.filePath,
            name: matched.name,
            content: matched.content,
            score: -ftsRow.rank, // FTS5 rank is negative (lower = better)
            matchType: "sparse",
          });
        }
      }

      return results;
    } catch {
      // FTS table may not exist or query may be invalid
      return [];
    }
  }

  private reciprocalRankFusion(
    denseResults: RetrievalResult[],
    sparseResults: RetrievalResult[],
    topK: number,
  ): RetrievalResult[] {
    const fusedScores = new Map<string, { result: RetrievalResult; score: number }>();

    // Score dense results by rank
    for (let rank = 0; rank < denseResults.length; rank++) {
      const result = denseResults[rank];
      const rrfScore = 1 / (RRF_K + rank + 1);
      fusedScores.set(result.chunkId, {
        result: { ...result, matchType: "dense" },
        score: rrfScore,
      });
    }

    // Score sparse results by rank, merging with dense if overlap
    for (let rank = 0; rank < sparseResults.length; rank++) {
      const result = sparseResults[rank];
      const rrfScore = 1 / (RRF_K + rank + 1);
      const existing = fusedScores.get(result.chunkId);

      if (existing) {
        existing.score += rrfScore;
        existing.result.matchType = "hybrid";
      } else {
        fusedScores.set(result.chunkId, {
          result: { ...result, matchType: "sparse" },
          score: rrfScore,
        });
      }
    }

    // Sort by fused score and return top-K
    const sorted = Array.from(fusedScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return sorted.map(({ result, score }) => ({
      ...result,
      score,
    }));
  }
}
