import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { eq, and, sql } from "drizzle-orm";
import { codeChunks } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { CodeChunker } from "./chunker.js";
import type { CodeChunk } from "./chunker.js";

const DEFAULT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

export class CodebaseIndexer {
  private db: TheIdeDatabase;
  private projectId: string;
  private chunker: CodeChunker;

  constructor(db: TheIdeDatabase, projectId: string) {
    this.db = db;
    this.projectId = projectId;
    this.chunker = new CodeChunker();
  }

  async indexFile(filePath: string, content: string): Promise<void> {
    const contentHash = createHash("sha256").update(content).digest("hex");

    // Check if file already indexed with same hash
    const existing = this.db
      .select({ contentHash: codeChunks.contentHash })
      .from(codeChunks)
      .where(
        and(
          eq(codeChunks.projectId, this.projectId),
          eq(codeChunks.filePath, filePath),
        ),
      )
      .limit(1)
      .all();

    if (existing.length > 0 && existing[0].contentHash === contentHash) {
      return; // No changes, skip re-indexing
    }

    // Remove old chunks for this file
    this.db
      .delete(codeChunks)
      .where(
        and(
          eq(codeChunks.projectId, this.projectId),
          eq(codeChunks.filePath, filePath),
        ),
      )
      .run();

    // Chunk the file and insert new chunks
    const chunks: CodeChunk[] = this.chunker.chunkFile(filePath, content);
    const now = new Date();

    for (const chunk of chunks) {
      const chunkId = uuidv4();
      const chunkHash = createHash("sha256").update(chunk.content).digest("hex");

      this.db.insert(codeChunks).values({
        id: chunkId,
        projectId: this.projectId,
        filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkType: chunk.chunkType,
        name: chunk.name,
        content: chunk.content,
        contentHash: chunkHash,
        dependencies: JSON.stringify(chunk.dependencies),
        exports: JSON.stringify(chunk.exports),
        updatedAt: now,
      }).run();
    }
  }

  async indexDirectory(dirPath: string, extensions?: string[]): Promise<void> {
    const allowedExtensions = extensions
      ? new Set(extensions.map((e) => (e.startsWith(".") ? e : `.${e}`)))
      : DEFAULT_EXTENSIONS;

    await this.walkDirectory(dirPath, allowedExtensions);
  }

  async removeStaleChunks(filePath: string): Promise<void> {
    this.db
      .delete(codeChunks)
      .where(
        and(
          eq(codeChunks.projectId, this.projectId),
          eq(codeChunks.filePath, filePath),
        ),
      )
      .run();
  }

  async getIndexStats(): Promise<{
    totalFiles: number;
    totalChunks: number;
    lastIndexedAt: Date | null;
  }> {
    const fileCountResult = this.db
      .select({
        count: sql<number>`COUNT(DISTINCT ${codeChunks.filePath})`,
      })
      .from(codeChunks)
      .where(eq(codeChunks.projectId, this.projectId))
      .all();

    const chunkCountResult = this.db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(codeChunks)
      .where(eq(codeChunks.projectId, this.projectId))
      .all();

    const lastUpdatedResult = this.db
      .select({
        lastUpdated: sql<number>`MAX(${codeChunks.updatedAt})`,
      })
      .from(codeChunks)
      .where(eq(codeChunks.projectId, this.projectId))
      .all();

    const totalFiles = Number(fileCountResult[0]?.count ?? 0);
    const totalChunks = Number(chunkCountResult[0]?.count ?? 0);
    const lastTimestamp = lastUpdatedResult[0]?.lastUpdated;
    const lastIndexedAt = lastTimestamp ? new Date(Number(lastTimestamp)) : null;

    return { totalFiles, totalChunks, lastIndexedAt };
  }

  private async walkDirectory(dirPath: string, allowedExtensions: Set<string>): Promise<void> {
    let entries;
    try {
      entries = await readdir(dirPath);
    } catch {
      return; // Skip inaccessible directories
    }

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);

      // Skip node_modules, .git, dist, and other common non-source directories
      if (this.shouldSkipDirectory(entry)) continue;

      let entryStat;
      try {
        entryStat = await stat(fullPath);
      } catch {
        continue;
      }

      if (entryStat.isDirectory()) {
        await this.walkDirectory(fullPath, allowedExtensions);
      } else if (entryStat.isFile()) {
        const ext = extname(fullPath);
        if (!allowedExtensions.has(ext)) continue;

        try {
          const content = await readFile(fullPath, "utf-8");
          await this.indexFile(fullPath, content);
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  private shouldSkipDirectory(name: string): boolean {
    const SKIP_DIRS = new Set([
      "node_modules",
      ".git",
      "dist",
      "build",
      ".next",
      ".cache",
      "coverage",
      ".turbo",
      ".output",
    ]);
    return SKIP_DIRS.has(name);
  }
}
