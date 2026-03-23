import { eq } from "drizzle-orm";
import { sprints } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export type WarningLevel = "ok" | "warning" | "critical" | "exceeded";

export interface BudgetInfo {
  total: number;
  used: number;
  remaining: number;
  percentUsed: number;
}

const WARNING_THRESHOLD = 0.70;
const CRITICAL_THRESHOLD = 0.85;
const EXCEEDED_THRESHOLD = 1.0;

export class TokenBudgetManager {
  private db: TheIdeDatabase;

  constructor(db: TheIdeDatabase) {
    this.db = db;
  }

  async allocateBudget(sprintId: string, totalBudget: number): Promise<void> {
    this.db
      .update(sprints)
      .set({ tokenBudget: totalBudget })
      .where(eq(sprints.id, sprintId))
      .run();
  }

  async getBudget(sprintId: string): Promise<BudgetInfo> {
    const rows = this.db
      .select({
        tokenBudget: sprints.tokenBudget,
        tokensUsed: sprints.tokensUsed,
      })
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1)
      .all();

    if (rows.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    const total = rows[0].tokenBudget;
    const used = rows[0].tokensUsed;
    const remaining = Math.max(0, total - used);
    const percentUsed = total > 0 ? (used / total) * 100 : 0;

    return { total, used, remaining, percentUsed };
  }

  async recordUsage(
    sprintId: string,
    tokens: { input: number; output: number; cacheRead: number; cacheCreation: number },
    model: string,
  ): Promise<void> {
    const totalTokens = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation;

    const rows = this.db
      .select({ tokensUsed: sprints.tokensUsed })
      .from(sprints)
      .where(eq(sprints.id, sprintId))
      .limit(1)
      .all();

    if (rows.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    const newUsed = rows[0].tokensUsed + totalTokens;
    this.db
      .update(sprints)
      .set({ tokensUsed: newUsed })
      .where(eq(sprints.id, sprintId))
      .run();
  }

  async isOverBudget(sprintId: string): Promise<boolean> {
    const budget = await this.getBudget(sprintId);
    return budget.used >= budget.total;
  }

  async getWarningLevel(sprintId: string): Promise<WarningLevel> {
    const budget = await this.getBudget(sprintId);
    const ratio = budget.total > 0 ? budget.used / budget.total : 0;

    if (ratio >= EXCEEDED_THRESHOLD) return "exceeded";
    if (ratio >= CRITICAL_THRESHOLD) return "critical";
    if (ratio >= WARNING_THRESHOLD) return "warning";
    return "ok";
  }
}
