import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { TheIdeDatabase } from "@the-ide/db";
import { CodebaseIndexer } from "@the-ide/rag";
import { Embedder } from "@the-ide/rag";
import { HybridRetriever } from "@the-ide/rag";
import { SemanticCache } from "@the-ide/rag";
import { ContextBuilder } from "@the-ide/rag";
import type { RetrievalResult } from "@the-ide/rag";
import type { TaskAssignment } from "./types/task.js";

/**
 * Configuration for the ContextProvider.
 */
export interface ContextProviderConfig {
  projectRoot: string;
  maxContextTokens: number;
  cacheEnabled: boolean;
}

/**
 * Formatted context string produced for a task, along with metadata.
 */
export interface TaskContext {
  content: string;
  totalTokens: number;
  isTruncated: boolean;
  chunkCount: number;
}

/** Separator used between context chunks in the assembled output. */
const CHUNK_SEPARATOR = "\n\n---\n\n";

/**
 * Derives a stable project ID from the project root path.
 */
function deriveProjectId(projectRoot: string): string {
  // Use the basename of the project root as a human-readable, stable identifier.
  return basename(projectRoot);
}

/**
 * Assembles a plain-text context string from an ordered list of retrieval results.
 */
function assembleContextString(chunks: RetrievalResult[]): string {
  return chunks
    .map((chunk) => `// ${chunk.filePath}\n${chunk.content}`)
    .join(CHUNK_SEPARATOR);
}

/**
 * Bridges the RAG system with agent task execution by providing
 * relevant codebase context for a given task assignment.
 */
export class ContextProvider {
  private readonly _db: TheIdeDatabase;
  private readonly _config: ContextProviderConfig;
  private readonly _projectId: string;
  private readonly _indexer: CodebaseIndexer;
  private readonly _embedder: Embedder;
  private readonly _retriever: HybridRetriever;
  private readonly _cache: SemanticCache;
  private readonly _contextBuilder: ContextBuilder;

  constructor(db: TheIdeDatabase, config: ContextProviderConfig) {
    this._db = db;
    this._config = config;
    this._projectId = deriveProjectId(config.projectRoot);

    this._embedder = new Embedder(db);
    this._indexer = new CodebaseIndexer(db, this._projectId);
    this._retriever = new HybridRetriever(db, this._embedder);
    this._cache = new SemanticCache(db, this._embedder);
    this._contextBuilder = new ContextBuilder(this._retriever);
  }

  /**
   * Indexes the entire project codebase from the configured project root.
   */
  async indexProject(): Promise<void> {
    await this._indexer.indexDirectory(this._config.projectRoot);
  }

  /**
   * Builds relevant codebase context for the given task assignment.
   *
   * The method:
   * 1. Builds a composite query from the task description and scope keywords.
   * 2. Searches for code related to that query.
   * 3. Searches additionally for code in each scope file.
   * 4. Combines all results via ContextBuilder, respecting the token budget.
   * 5. Caches the assembled result when caching is enabled.
   *
   * @param task - The task assignment to build context for.
   * @returns A plain-text string with relevant code snippets.
   */
  async getContextForTask(task: TaskAssignment): Promise<string> {
    const { description, scopeKeywords, scopeFiles } = task.goalContext;

    // Compose the primary search query from description + scope keywords
    const primaryQuery = [description, ...scopeKeywords].join(" ");

    if (this._config.cacheEnabled) {
      const cached = await this._cache.get(primaryQuery);
      if (cached !== null) {
        return assembleContextString(cached);
      }
    }

    // Retrieve results for the primary query via ContextBuilder
    const primaryResult = await this._contextBuilder.buildContext(
      primaryQuery,
      this._projectId,
      this._config.maxContextTokens,
    );

    // Collect additional chunks by querying each scope file path individually.
    // We keep a running token budget so we stay within limits.
    const seenChunkIds = new Set<string>(primaryResult.chunks.map((c) => c.chunkId));
    const additionalChunks: RetrievalResult[] = [];
    let usedTokens = primaryResult.totalTokens;
    const remainingBudget = this._config.maxContextTokens - usedTokens;

    if (scopeFiles.length > 0 && remainingBudget > 0) {
      const scopeFileQuery = scopeFiles.join(" ");
      const scopeResult = await this._contextBuilder.buildContext(
        scopeFileQuery,
        this._projectId,
        remainingBudget,
      );

      for (const chunk of scopeResult.chunks) {
        if (!seenChunkIds.has(chunk.chunkId)) {
          additionalChunks.push(chunk);
          seenChunkIds.add(chunk.chunkId);
          usedTokens += chunk.content.length / 4; // rough token estimate
        }
      }
    }

    const combinedChunks = [...primaryResult.chunks, ...additionalChunks];
    const contextString = assembleContextString(combinedChunks);

    if (this._config.cacheEnabled) {
      await this._cache.set(primaryQuery, combinedChunks);
    }

    return contextString;
  }

  /**
   * Invalidates cache entries that reference any of the given file paths.
   *
   * @param filePaths - Absolute paths of files whose cached results should be evicted.
   */
  async invalidateCache(filePaths: string[]): Promise<void> {
    this._cache.invalidate(filePaths);
  }

  /**
   * Re-indexes specific files after they have been modified.
   * Also invalidates any cached results that reference those files.
   *
   * @param filePaths - Absolute paths of files to re-index.
   */
  async reindexFiles(filePaths: string[]): Promise<void> {
    await this.invalidateCache(filePaths);

    for (const filePath of filePaths) {
      try {
        const content = await readFile(filePath, "utf-8");
        await this._indexer.indexFile(filePath, content);
      } catch {
        // If the file cannot be read (e.g. it was deleted), remove stale chunks.
        await this._indexer.removeStaleChunks(filePath);
      }
    }
  }
}
