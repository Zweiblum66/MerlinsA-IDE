import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import { Embedder, computeCosineSimilarity } from "./embedder.js";

describe("computeCosineSimilarity", () => {
  it("should return 1 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3]);
    const similarity = computeCosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  it("should return 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    const similarity = computeCosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(0.0, 5);
  });

  it("should return -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    const similarity = computeCosineSimilarity(a, b);
    expect(similarity).toBeCloseTo(-1.0, 5);
  });

  it("should throw on dimension mismatch", () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(() => computeCosineSimilarity(a, b)).toThrow("Vector dimension mismatch");
  });

  it("should return 0 when a vector is all zeros", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    const similarity = computeCosineSimilarity(a, b);
    expect(similarity).toBe(0);
  });
});

describe("Embedder placeholder embedding", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db as any);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("should produce deterministic results for the same content", () => {
    const embedder = new Embedder(db as any);
    const embedding1 = embedder.generateQueryEmbedding("function hello() {}");
    const embedding2 = embedder.generateQueryEmbedding("function hello() {}");
    expect(embedding1).toEqual(embedding2);
  });

  it("should produce different embeddings for different content", () => {
    const embedder = new Embedder(db as any);
    const embedding1 = embedder.generateQueryEmbedding("function hello() {}");
    const embedding2 = embedder.generateQueryEmbedding("class World {}");
    // They should not be identical
    const similarity = computeCosineSimilarity(embedding1, embedding2);
    expect(similarity).toBeLessThan(1.0);
  });

  it("should produce normalized unit vectors", () => {
    const embedder = new Embedder(db as any);
    const embedding = embedder.generateQueryEmbedding("test content");
    // Magnitude should be ~1
    let magnitude = 0;
    for (let i = 0; i < embedding.length; i++) {
      magnitude += embedding[i] * embedding[i];
    }
    magnitude = Math.sqrt(magnitude);
    expect(magnitude).toBeCloseTo(1.0, 3);
  });

  it("should produce embeddings of dimension 384", () => {
    const embedder = new Embedder(db as any);
    const embedding = embedder.generateQueryEmbedding("some code");
    expect(embedding.length).toBe(384);
  });
});
