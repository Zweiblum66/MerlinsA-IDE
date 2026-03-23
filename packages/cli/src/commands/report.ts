import { Command } from "commander";
import chalk from "chalk";
import { createDatabase } from "@the-ide/db";
import { tokenUsage, sprints, agentSessions } from "@the-ide/db";
import { eq, sql } from "drizzle-orm";

export const reportCommand = new Command("report")
  .description("Reports and analytics");

reportCommand
  .command("tokens")
  .description("Show token usage report")
  .argument("<sprint-id>", "Sprint ID")
  .action(async (sprintId: string) => {
    const db = createDatabase();

    const sprint = db.select().from(sprints)
      .where(eq(sprints.id, sprintId))
      .get();

    if (!sprint) {
      console.log(chalk.red("\n  Sprint not found\n"));
      return;
    }

    const usage = db.select({
      model: tokenUsage.model,
      totalInput: sql<number>`sum(${tokenUsage.inputTokens})`,
      totalOutput: sql<number>`sum(${tokenUsage.outputTokens})`,
      totalCacheRead: sql<number>`sum(${tokenUsage.cacheReadTokens})`,
      totalCacheCreation: sql<number>`sum(${tokenUsage.cacheCreationTokens})`,
      totalCost: sql<number>`sum(${tokenUsage.costUsd})`,
    })
      .from(tokenUsage)
      .where(eq(tokenUsage.sprintId, sprintId))
      .groupBy(tokenUsage.model)
      .all();

    const budgetPercent = sprint.tokenBudget > 0
      ? Math.round((sprint.tokensUsed / sprint.tokenBudget) * 100)
      : 0;

    const warningLevel = budgetPercent >= 100 ? "EXCEEDED"
      : budgetPercent >= 85 ? "CRITICAL"
      : budgetPercent >= 70 ? "WARNING"
      : "OK";

    const warningColor = warningLevel === "EXCEEDED" ? chalk.red
      : warningLevel === "CRITICAL" ? chalk.red
      : warningLevel === "WARNING" ? chalk.yellow
      : chalk.green;

    console.log(chalk.blue(`\n  Token Usage Report — Sprint ${sprint.number}\n`));
    console.log(chalk.white("  Budget:"));
    console.log(chalk.gray(`    Total:     ${sprint.tokenBudget.toLocaleString()}`));
    console.log(chalk.gray(`    Used:      ${sprint.tokensUsed.toLocaleString()}`));
    console.log(chalk.gray(`    Remaining: ${(sprint.tokenBudget - sprint.tokensUsed).toLocaleString()}`));
    console.log(warningColor(`    Status:    ${warningLevel} (${budgetPercent}%)`));
    console.log("");

    if (usage.length > 0) {
      console.log(chalk.white("  By Model:"));
      for (const row of usage) {
        const totalTokens = (row.totalInput || 0) + (row.totalOutput || 0);
        console.log(chalk.cyan(`    ${row.model}`));
        console.log(chalk.gray(`      Input:    ${(row.totalInput || 0).toLocaleString()}`));
        console.log(chalk.gray(`      Output:   ${(row.totalOutput || 0).toLocaleString()}`));
        console.log(chalk.gray(`      Cache:    ${(row.totalCacheRead || 0).toLocaleString()} read / ${(row.totalCacheCreation || 0).toLocaleString()} created`));
        console.log(chalk.gray(`      Total:    ${totalTokens.toLocaleString()}`));
        console.log(chalk.gray(`      Cost:     $${(row.totalCost || 0).toFixed(4)}`));
      }
    } else {
      console.log(chalk.gray("  No token usage recorded yet"));
    }

    console.log("");
  });

reportCommand
  .command("agents")
  .description("Show agent performance report")
  .argument("<sprint-id>", "Sprint ID")
  .action(async (sprintId: string) => {
    const db = createDatabase();

    const sessions = db.select().from(agentSessions)
      .where(eq(agentSessions.sprintId, sprintId))
      .all();

    console.log(chalk.blue("\n  Agent Performance Report\n"));

    if (sessions.length === 0) {
      console.log(chalk.gray("  No agent sessions found for this sprint\n"));
      return;
    }

    const byAgent = new Map<string, { count: number; completed: number; failed: number; totalCost: number; maxDrift: number }>();

    for (const session of sessions) {
      const existing = byAgent.get(session.agentName) || { count: 0, completed: 0, failed: 0, totalCost: 0, maxDrift: 0 };
      existing.count++;
      if (session.status === "COMPLETED") existing.completed++;
      if (session.status === "FAILED") existing.failed++;
      existing.totalCost += session.costUsd;
      existing.maxDrift = Math.max(existing.maxDrift, session.driftScore);
      byAgent.set(session.agentName, existing);
    }

    for (const [agentName, stats] of byAgent) {
      const successRate = stats.count > 0 ? Math.round((stats.completed / stats.count) * 100) : 0;
      console.log(chalk.white(`  ${agentName}`));
      console.log(chalk.gray(`    Sessions:     ${stats.count}`));
      console.log(chalk.gray(`    Success rate:  ${successRate}%`));
      console.log(chalk.gray(`    Total cost:    $${stats.totalCost.toFixed(4)}`));
      if (stats.maxDrift >= 3) {
        console.log(chalk.red(`    Max drift:     ${stats.maxDrift} [HIGH]`));
      } else {
        console.log(chalk.gray(`    Max drift:     ${stats.maxDrift}`));
      }
      console.log("");
    }
  });
