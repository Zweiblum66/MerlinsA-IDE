import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { tokenUsage, agentSessions } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export interface TokenUsageRecord {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface AggregateUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  costUsd: number;
}

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadMultiplier: number;
  cacheCreationMultiplier: number;
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 0.25,
  },
  "claude-haiku-35-20241022": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 0.25,
  },
  "claude-opus-4-20250115": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadMultiplier: 0.1,
    cacheCreationMultiplier: 0.25,
  },
};

// Fallback pricing for unknown models (use sonnet pricing)
const DEFAULT_PRICING: ModelPricing = MODEL_PRICING["claude-sonnet-4-20250514"];

export function calculateCost(
  tokens: TokenUsageRecord,
  model: string,
): number {
  const pricing = MODEL_PRICING[model] ?? DEFAULT_PRICING;

  const inputCost = (tokens.input / 1_000_000) * pricing.inputPerMillion;
  const outputCost = (tokens.output / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost =
    (tokens.cacheRead / 1_000_000) *
    pricing.inputPerMillion *
    pricing.cacheReadMultiplier;
  const cacheCreationCost =
    (tokens.cacheCreation / 1_000_000) *
    pricing.inputPerMillion *
    pricing.cacheCreationMultiplier;

  return inputCost + outputCost + cacheReadCost + cacheCreationCost;
}

export class UsageTracker {
  private db: TheIdeDatabase;

  constructor(db: TheIdeDatabase) {
    this.db = db;
  }

  async recordApiCall(
    sessionId: string,
    sprintId: string | null,
    usage: TokenUsageRecord,
    model: string,
  ): Promise<void> {
    const costUsd = calculateCost(usage, model);

    this.db.insert(tokenUsage).values({
      id: uuidv4(),
      sessionId,
      sprintId,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheCreationTokens: usage.cacheCreation,
      costUsd,
      model,
      timestamp: new Date(),
    }).run();
  }

  async getSessionUsage(sessionId: string): Promise<AggregateUsage> {
    const rows = this.db
      .select({
        input: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        output: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        cacheRead: sql<number>`COALESCE(SUM(${tokenUsage.cacheReadTokens}), 0)`,
        cacheCreation: sql<number>`COALESCE(SUM(${tokenUsage.cacheCreationTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${tokenUsage.costUsd}), 0)`,
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.sessionId, sessionId))
      .all();

    const row = rows[0];
    return {
      input: Number(row.input),
      output: Number(row.output),
      cacheRead: Number(row.cacheRead),
      cacheCreation: Number(row.cacheCreation),
      costUsd: Number(row.costUsd),
    };
  }

  async getSprintUsage(sprintId: string): Promise<AggregateUsage> {
    const rows = this.db
      .select({
        input: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        output: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        cacheRead: sql<number>`COALESCE(SUM(${tokenUsage.cacheReadTokens}), 0)`,
        cacheCreation: sql<number>`COALESCE(SUM(${tokenUsage.cacheCreationTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${tokenUsage.costUsd}), 0)`,
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.sprintId, sprintId))
      .all();

    const row = rows[0];
    return {
      input: Number(row.input),
      output: Number(row.output),
      cacheRead: Number(row.cacheRead),
      cacheCreation: Number(row.cacheCreation),
      costUsd: Number(row.costUsd),
    };
  }

  async getProjectUsage(projectId: string): Promise<AggregateUsage> {
    const rows = this.db
      .select({
        input: sql<number>`COALESCE(SUM(${tokenUsage.inputTokens}), 0)`,
        output: sql<number>`COALESCE(SUM(${tokenUsage.outputTokens}), 0)`,
        cacheRead: sql<number>`COALESCE(SUM(${tokenUsage.cacheReadTokens}), 0)`,
        cacheCreation: sql<number>`COALESCE(SUM(${tokenUsage.cacheCreationTokens}), 0)`,
        costUsd: sql<number>`COALESCE(SUM(${tokenUsage.costUsd}), 0)`,
      })
      .from(tokenUsage)
      .innerJoin(agentSessions, eq(tokenUsage.sessionId, agentSessions.id))
      .where(sql`${agentSessions.sprintId} IN (
        SELECT id FROM sprints WHERE project_id = ${projectId}
      )`)
      .all();

    const row = rows[0];
    return {
      input: Number(row.input),
      output: Number(row.output),
      cacheRead: Number(row.cacheRead),
      cacheCreation: Number(row.cacheCreation),
      costUsd: Number(row.costUsd),
    };
  }
}
