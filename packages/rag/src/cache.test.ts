import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import { Embedder } from "./embedder.js";
import { SemanticCache } from "./cache.js";
import type { RetrievalResult } from "./retriever.js";

describe("SemanticCache", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let embedder: Embedder;
  let cache: SemanticCache;

  const mockResults: RetrievalResult[] = [
    {
      chunkId: "chunk-1",
      filePath: "src/utils.ts",
      name: "helperFunction",
      content: "function helperFunction() { return 42; }",
      score: 0.95,
      matchType: "hybrid",
    },
    {
      chunkId: "chunk-2",
      filePath: "src/main.ts",
      name: "mainEntry",
      content: "function main() { helperFunction(); }",
      score: 0.85,
      matchType: "dense",
    },
  ];

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db as any);
    embedder = new Embedder(db as any);
    cache = new SemanticCache(db as any, embedder);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("should roundtrip set() and get() for the same query", async () => {
    await cache.set("how does the helper function work", mockResults);
    const result = await cache.get("how does the helper function work");
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    expect(result![0].chunkId).toBe("chunk-1");
    expect(result![1].chunkId).toBe("chunk-2");
  });

  it("should return null for dissimilar queries", async () => {
    await cache.set("how does the helper function work", mockResults);
    const result = await cache.get("completely unrelated topic about databases and SQL");
    expect(result).toBeNull();
  });

  it("should invalidate entries referencing given file paths", async () => {
    await cache.set("query about utils", mockResults);

    // Verify it's cached
    const before = await cache.get("query about utils");
    expect(before).not.toBeNull();

    // Invalidate by file path
    cache.invalidate(["src/utils.ts"]);

    // Should be gone
    const after = await cache.get("query about utils");
    expect(after).toBeNull();
  });

  it("should not invalidate entries that do not reference the given file paths", async () => {
    const otherResults: RetrievalResult[] = [
      {
        chunkId: "chunk-3",
        filePath: "src/other.ts",
        name: "otherFunc",
        content: "function otherFunc() {}",
        score: 0.9,
        matchType: "sparse",
      },
    ];

    await cache.set("query about utils", mockResults);
    await cache.set("query about other", otherResults);

    cache.invalidate(["src/utils.ts"]);

    // utils query should be gone
    const utilsResult = await cache.get("query about utils");
    expect(utilsResult).toBeNull();

    // other query should remain
    const otherResult = await cache.get("query about other");
    expect(otherResult).not.toBeNull();
    expect(otherResult).toHaveLength(1);
  });

  it("should clear all entries with clear()", async () => {
    await cache.set("query one", mockResults);
    await cache.set("query two", mockResults);

    cache.clear();

    const result1 = await cache.get("query one");
    const result2 = await cache.get("query two");
    expect(result1).toBeNull();
    expect(result2).toBeNull();
  });
});
