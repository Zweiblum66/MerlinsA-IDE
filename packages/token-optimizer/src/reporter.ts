import { eq, sql } from "drizzle-orm";
import { tokenUsage, agentSessions } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import type { UsageTracker } from "./tracker.js";
import type { TokenBudgetManager, WarningLevel } from "./budget.js";

export interface SprintTokenReport {
  sprintId: string;
  budget: number;
  used: number;
  remaining: number;
  costUsd: number;
  byAgent: Record<string, { tokens: number; cost: number }>;
  byModel: Record<string, { tokens: number; cost: number }>;
  warningLevel: WarningLevel;
}

export class UsageReporter {
  private tracker: UsageTracker;
  private budgetManager: TokenBudgetManager;
  private db: TheIdeDatabase;

  constructor(tracker: UsageTracker, budgetManager: TokenBudgetManager, db: TheIdeDatabase) {
    this.tracker = tracker;
    this.budgetManager = budgetManager;
    this.db = db;
  }

  async generateSprintReport(sprintId: string): Promise<SprintTokenReport> {
    const budget = await this.budgetManager.getBudget(sprintId);
    const warningLevel = await this.budgetManager.getWarningLevel(sprintId);
    const sprintUsage = await this.tracker.getSprintUsage(sprintId);

    // Per-agent breakdown
    const agentRows = this.db
      .select({
        agentName: agentSessions.agentName,
        totalTokens: sql<number>`COALESCE(SUM(
          ${tokenUsage.inputTokens} + ${tokenUsage.outputTokens} +
          ${tokenUsage.cacheReadTokens} + ${tokenUsage.cacheCreationTokens}
        ), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${tokenUsage.costUsd}), 0)`,
      })
      .from(tokenUsage)
      .innerJoin(agentSessions, eq(tokenUsage.sessionId, agentSessions.id))
      .where(eq(tokenUsage.sprintId, sprintId))
      .groupBy(agentSessions.agentName)
      .all();

    const byAgent: Record<string, { tokens: number; cost: number }> = {};
    for (const row of agentRows) {
      byAgent[row.agentName] = {
        tokens: Number(row.totalTokens),
        cost: Number(row.totalCost),
      };
    }

    // Per-model breakdown
    const modelRows = this.db
      .select({
        model: tokenUsage.model,
        totalTokens: sql<number>`COALESCE(SUM(
          ${tokenUsage.inputTokens} + ${tokenUsage.outputTokens} +
          ${tokenUsage.cacheReadTokens} + ${tokenUsage.cacheCreationTokens}
        ), 0)`,
        totalCost: sql<number>`COALESCE(SUM(${tokenUsage.costUsd}), 0)`,
      })
      .from(tokenUsage)
      .where(eq(tokenUsage.sprintId, sprintId))
      .groupBy(tokenUsage.model)
      .all();

    const byModel: Record<string, { tokens: number; cost: number }> = {};
    for (const row of modelRows) {
      byModel[row.model] = {
        tokens: Number(row.totalTokens),
        cost: Number(row.totalCost),
      };
    }

    return {
      sprintId,
      budget: budget.total,
      used: budget.used,
      remaining: budget.remaining,
      costUsd: sprintUsage.costUsd,
      byAgent,
      byModel,
      warningLevel,
    };
  }

  async generateSummary(projectId: string): Promise<string> {
    const projectUsage = await this.tracker.getProjectUsage(projectId);

    const totalTokens =
      projectUsage.input +
      projectUsage.output +
      projectUsage.cacheRead +
      projectUsage.cacheCreation;

    const lines: string[] = [
      `=== Project Token Usage Summary ===`,
      ``,
      `Total tokens used: ${totalTokens.toLocaleString()}`,
      `  Input:          ${projectUsage.input.toLocaleString()}`,
      `  Output:         ${projectUsage.output.toLocaleString()}`,
      `  Cache read:     ${projectUsage.cacheRead.toLocaleString()}`,
      `  Cache creation: ${projectUsage.cacheCreation.toLocaleString()}`,
      ``,
      `Total cost: $${projectUsage.costUsd.toFixed(4)}`,
    ];

    // Calculate cache efficiency
    const totalInput = projectUsage.input + projectUsage.cacheRead;
    if (totalInput > 0) {
      const cacheHitRate = (projectUsage.cacheRead / totalInput) * 100;
      lines.push(`Cache hit rate: ${cacheHitRate.toFixed(1)}%`);
    }

    return lines.join("\n");
  }
}
