import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { embeddings } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

const EMBEDDING_DIM = 384;
const MODEL_NAME = "placeholder-hash-v1";

export class Embedder {
  private db: TheIdeDatabase;

  constructor(db: TheIdeDatabase) {
    this.db = db;
  }

  async embedChunk(chunkId: string, content: string): Promise<void> {
    const vector = this.generatePlaceholderEmbedding(content);
    const vectorBuffer = Buffer.from(vector.buffer);

    this.db
      .insert(embeddings)
      .values({
        chunkId,
        vector: vectorBuffer,
        model: MODEL_NAME,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: embeddings.chunkId,
        set: {
          vector: vectorBuffer,
          model: MODEL_NAME,
          createdAt: new Date(),
        },
      })
      .run();
  }

  async embedBatch(chunks: { id: string; content: string }[]): Promise<void> {
    for (const chunk of chunks) {
      await this.embedChunk(chunk.id, chunk.content);
    }
  }

  async getEmbedding(chunkId: string): Promise<Float32Array | null> {
    const rows = this.db
      .select()
      .from(embeddings)
      .where(eq(embeddings.chunkId, chunkId))
      .limit(1)
      .all();

    if (rows.length === 0) return null;

    const buffer = rows[0].vector as Buffer;
    return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
  }

  generateQueryEmbedding(query: string): Float32Array {
    return this.generatePlaceholderEmbedding(query);
  }

  /**
   * Placeholder embedding: creates a deterministic vector from content hash.
   * Can be replaced with Transformers.js integration later.
   */
  private generatePlaceholderEmbedding(content: string): Float32Array {
    const hash = createHash("sha256").update(content).digest();
    const vector = new Float32Array(EMBEDDING_DIM);

    for (let i = 0; i < EMBEDDING_DIM; i++) {
      const byteIndex = i % hash.length;
      // Map byte value to [-1, 1] range
      vector[i] = (hash[byteIndex] / 127.5) - 1.0;
      // Mix with position to create more variation
      if (i >= hash.length) {
        const secondary = createHash("md5")
          .update(`${content}:${Math.floor(i / hash.length)}`)
          .digest();
        vector[i] = (secondary[i % secondary.length] / 127.5) - 1.0;
      }
    }

    // Normalize to unit vector
    let magnitude = 0;
    for (let i = 0; i < EMBEDDING_DIM; i++) {
      magnitude += vector[i] * vector[i];
    }
    magnitude = Math.sqrt(magnitude);
    if (magnitude > 0) {
      for (let i = 0; i < EMBEDDING_DIM; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }
}

export function computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
