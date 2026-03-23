import { HybridRetriever } from "./retriever.js";
import type { RetrievalResult } from "./retriever.js";

const CHARS_PER_TOKEN = 4;

export interface ContextResult {
  chunks: RetrievalResult[];
  totalTokens: number;
  truncated: boolean;
}

export class ContextBuilder {
  private retriever: HybridRetriever;

  constructor(retriever: HybridRetriever) {
    this.retriever = retriever;
  }

  async buildContext(
    query: string,
    projectId: string,
    maxTokens: number,
  ): Promise<ContextResult> {
    // Retrieve more candidates than we might need
    const candidates = await this.retriever.retrieve(query, projectId, 50);

    const selectedChunks: RetrievalResult[] = [];
    let totalTokens = 0;
    let truncated = false;

    // Candidates are already sorted by retrieval score (descending)
    for (const chunk of candidates) {
      const chunkTokens = this.estimateTokens(chunk.content);

      if (totalTokens + chunkTokens > maxTokens) {
        truncated = true;
        break;
      }

      selectedChunks.push(chunk);
      totalTokens += chunkTokens;
    }

    return {
      chunks: selectedChunks,
      totalTokens,
      truncated,
    };
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }
}
