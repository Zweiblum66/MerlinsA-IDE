import { Command } from "commander";
import chalk from "chalk";
import { createDatabase } from "@the-ide/db";
import {
  projects,
  sprints,
  tasks,
  userStories,
  agentSessions,
  tokenUsage,
  apiContracts,
  apiChanges,
  namingViolations,
} from "@the-ide/db";
import { eq, sql, and } from "drizzle-orm";
import { formatTokenCount, formatCost } from "../ui/progress.js";

const WIDTH = 68;
const DIVIDER = chalk.gray("─".repeat(WIDTH));

export const auditCommand = new Command("audit")
  .description("Audit and monitoring commands for project health");

// ─── audit health ───────────────────────────────────────────────────────

auditCommand
  .command("health")
  .description("Overall project health check")
  .argument("<project-id>", "Project ID")
  .action(async (projectId: string) => {
    const db = createDatabase();

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
    if (!project) {
      console.log(chalk.red("\n  Project not found\n"));
      return;
    }

    console.log("");
    console.log(chalk.blue.bold(`  Project Health: ${project.name}`));
    console.log(DIVIDER);

    const checks: { name: string; status: "pass" | "warn" | "fail"; detail: string }[] = [];

    // 1. Sprint status
    const allSprints = db.select().from(sprints).where(eq(sprints.projectId, projectId)).all();
    const activeSprint = allSprints.find((s) => s.status === "IN_PROGRESS");

    if (activeSprint) {
      checks.push({ name: "Active Sprint", status: "pass", detail: `Sprint ${activeSprint.number} in progress` });
    } else if (allSprints.length > 0) {
      checks.push({ name: "Active Sprint", status: "warn", detail: "No active sprint — consider starting one" });
    } else {
      checks.push({ name: "Active Sprint", status: "fail", detail: "No sprints created yet" });
    }

    // 2. Token budget
    if (activeSprint) {
      const budgetPercent = activeSprint.tokenBudget > 0
        ? Math.round((activeSprint.tokensUsed / activeSprint.tokenBudget) * 100)
        : 0;

      if (budgetPercent >= 100) {
        checks.push({ name: "Token Budget", status: "fail", detail: `EXCEEDED — ${budgetPercent}% used` });
      } else if (budgetPercent >= 85) {
        checks.push({ name: "Token Budget", status: "warn", detail: `CRITICAL — ${budgetPercent}% used` });
      } else {
        checks.push({ name: "Token Budget", status: "pass", detail: `${budgetPercent}% used` });
      }
    }

    // 3. Blocked tasks
    const sprintId = activeSprint?.id;
    if (sprintId) {
      const blockedRows = db
        .select({ id: tasks.id })
        .from(tasks)
        .innerJoin(userStories, eq(tasks.userStoryId, userStories.id))
        .where(and(eq(userStories.sprintId, sprintId), eq(tasks.status, "BLOCKED")))
        .all();

      if (blockedRows.length === 0) {
        checks.push({ name: "Blocked Tasks", status: "pass", detail: "No blocked tasks" });
      } else if (blockedRows.length <= 2) {
        checks.push({ name: "Blocked Tasks", status: "warn", detail: `${blockedRows.length} blocked` });
      } else {
        checks.push({ name: "Blocked Tasks", status: "fail", detail: `${blockedRows.length} blocked — impediment likely` });
      }
    }

    // 4. API contract drift
    const breakingChanges = db
      .select({ id: apiChanges.id })
      .from(apiChanges)
      .innerJoin(apiContracts, eq(apiChanges.contractId, apiContracts.id))
      .where(and(eq(apiContracts.projectId, projectId), eq(apiChanges.isBreaking, 1)))
      .all();

    if (breakingChanges.length === 0) {
      checks.push({ name: "API Contracts", status: "pass", detail: "No breaking changes" });
    } else {
      checks.push({ name: "API Contracts", status: "fail", detail: `${breakingChanges.length} breaking changes detected` });
    }

    // 5. Naming violations
    const violationRows = db
      .select({ id: namingViolations.id })
      .from(namingViolations)
      .where(eq(namingViolations.projectId, projectId))
      .all();

    if (violationRows.length === 0) {
      checks.push({ name: "Naming Conventions", status: "pass", detail: "No violations" });
    } else if (violationRows.length <= 5) {
      checks.push({ name: "Naming Conventions", status: "warn", detail: `${violationRows.length} violations` });
    } else {
      checks.push({ name: "Naming Conventions", status: "fail", detail: `${violationRows.length} violations` });
    }

    // 6. Agent drift
    if (sprintId) {
      const highDriftSessions = db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.sprintId, sprintId))
        .all()
        .filter((s) => s.driftScore >= 3);

      if (highDriftSessions.length === 0) {
        checks.push({ name: "Goal Drift", status: "pass", detail: "All agents on track" });
      } else {
        const names = highDriftSessions.map((s) => s.agentName).join(", ");
        checks.push({ name: "Goal Drift", status: "fail", detail: `High drift: ${names}` });
      }
    }

    // 7. Failed agents
    if (sprintId) {
      const failedSessions = db
        .select()
        .from(agentSessions)
        .where(and(eq(agentSessions.sprintId, sprintId), eq(agentSessions.status, "FAILED")))
        .all();

      if (failedSessions.length === 0) {
        checks.push({ name: "Agent Failures", status: "pass", detail: "No failures" });
      } else {
        checks.push({ name: "Agent Failures", status: "fail", detail: `${failedSessions.length} agent(s) failed` });
      }
    }

    // Render checks
    console.log("");
    for (const check of checks) {
      const icon =
        check.status === "pass" ? chalk.green("✓")
          : check.status === "warn" ? chalk.yellow("⚠")
            : chalk.red("✗");

      const color =
        check.status === "pass" ? chalk.green
          : check.status === "warn" ? chalk.yellow
            : chalk.red;

      console.log(`  ${icon}  ${chalk.white(check.name.padEnd(22))} ${color(check.detail)}`);
    }

    // Overall score
    const passCount = checks.filter((c) => c.status === "pass").length;
    const failCount = checks.filter((c) => c.status === "fail").length;
    const scorePercent = Math.round((passCount / checks.length) * 100);
    const scoreColor = failCount > 0 ? chalk.red : scorePercent >= 80 ? chalk.green : chalk.yellow;

    console.log("");
    console.log(DIVIDER);
    console.log(`  ${chalk.white("Health Score:")} ${scoreColor(`${scorePercent}%`)}  (${passCount}/${checks.length} checks passing)`);
    console.log("");
  });

// ─── audit agents ───────────────────────────────────────────────────────

auditCommand
  .command("agents")
  .description("Detailed agent session audit log")
  .argument("<sprint-id>", "Sprint ID")
  .action(async (sprintId: string) => {
    const db = createDatabase();

    const sessions = db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.sprintId, sprintId))
      .all();

    console.log("");
    console.log(chalk.blue.bold("  Agent Audit Log"));
    console.log(DIVIDER);

    if (sessions.length === 0) {
      console.log(chalk.gray("\n  No agent sessions found\n"));
      return;
    }

    for (const session of sessions) {
      const statusColor =
        session.status === "COMPLETED" ? chalk.green
          : session.status === "FAILED" ? chalk.red
            : session.status === "ACTIVE" ? chalk.cyan
              : chalk.yellow;

      const driftColor = session.driftScore >= 3 ? chalk.red : session.driftScore > 0 ? chalk.yellow : chalk.gray;

      console.log("");
      console.log(`  ${chalk.white.bold(session.agentName)}  ${statusColor(`[${session.status}]`)}`);
      console.log(chalk.gray(`  ID:      ${session.id}`));
      console.log(chalk.gray(`  Task:    ${session.taskId ?? "—"}`));
      console.log(chalk.gray(`  Model:   ${session.model}`));
      console.log(chalk.gray(`  Cost:    ${formatCost(session.costUsd)}`));
      console.log(`  ${chalk.gray("Drift:")}   ${driftColor(String(session.driftScore))}`);

      if (session.startedAt) {
        console.log(chalk.gray(`  Started: ${new Date(session.startedAt).toLocaleString()}`));
      }
      if (session.endedAt) {
        console.log(chalk.gray(`  Ended:   ${new Date(session.endedAt).toLocaleString()}`));
      }
    }

    // Summary
    console.log("");
    console.log(DIVIDER);

    const totalCost = sessions.reduce((sum, s) => sum + s.costUsd, 0);
    const completed = sessions.filter((s) => s.status === "COMPLETED").length;
    const failed = sessions.filter((s) => s.status === "FAILED").length;

    console.log(`  ${chalk.white("Sessions:")} ${sessions.length}  ${chalk.green(`Completed: ${completed}`)}  ${chalk.red(`Failed: ${failed}`)}`);
    console.log(`  ${chalk.white("Total Cost:")} ${formatCost(totalCost)}`);
    console.log("");
  });

// ─── audit tokens ───────────────────────────────────────────────────────

auditCommand
  .command("tokens")
  .description("Token usage audit with cost breakdown")
  .argument("<sprint-id>", "Sprint ID")
  .action(async (sprintId: string) => {
    const db = createDatabase();

    const sprint = db.select().from(sprints).where(eq(sprints.id, sprintId)).get();
    if (!sprint) {
      console.log(chalk.red("\n  Sprint not found\n"));
      return;
    }

    console.log("");
    console.log(chalk.blue.bold(`  Token Audit — Sprint ${sprint.number}`));
    console.log(DIVIDER);

    // By agent
    const byAgent = db
      .select({
        agent: agentSessions.agentName,
        totalInput: sql<number>`sum(${tokenUsage.inputTokens})`,
        totalOutput: sql<number>`sum(${tokenUsage.outputTokens})`,
        totalCacheRead: sql<number>`sum(${tokenUsage.cacheReadTokens})`,
        totalCost: sql<number>`sum(${tokenUsage.costUsd})`,
      })
      .from(tokenUsage)
      .innerJoin(agentSessions, eq(tokenUsage.sessionId, agentSessions.id))
      .where(eq(tokenUsage.sprintId, sprintId))
      .groupBy(agentSessions.agentName)
      .all();

    console.log("");
    console.log(chalk.white.bold("  By Agent"));
    console.log(`  ${chalk.gray("─".repeat(62))}`);

    if (byAgent.length === 0) {
      console.log(chalk.gray("  No token usage recorded"));
    }

    for (const row of byAgent) {
      const total = (row.totalInput ?? 0) + (row.totalOutput ?? 0);
      const cacheRate = total > 0 ? Math.round(((row.totalCacheRead ?? 0) / total) * 100) : 0;

      console.log(`  ${chalk.cyan(row.agent?.padEnd(20) ?? "unknown")} ${chalk.gray(formatTokenCount(total).padEnd(10))} ${chalk.gray(formatCost(row.totalCost ?? 0).padEnd(10))} ${chalk.gray(`cache: ${cacheRate}%`)}`);
    }

    // Budget status
    const budgetPercent = sprint.tokenBudget > 0
      ? Math.round((sprint.tokensUsed / sprint.tokenBudget) * 100)
      : 0;
    const remaining = Math.max(0, sprint.tokenBudget - sprint.tokensUsed);
    const totalCost = byAgent.reduce((sum, r) => sum + (r.totalCost ?? 0), 0);

    console.log("");
    console.log(DIVIDER);
    console.log(`  ${chalk.white("Budget:")} ${formatTokenCount(sprint.tokensUsed)} / ${formatTokenCount(sprint.tokenBudget)} (${budgetPercent}%)`);
    console.log(`  ${chalk.white("Remaining:")} ${formatTokenCount(remaining)}  ${chalk.white("Total Cost:")} ${formatCost(totalCost)}`);
    console.log("");
  });

// ─── audit api ──────────────────────────────────────────────────────────

auditCommand
  .command("api")
  .description("API contract compliance audit")
  .argument("<project-id>", "Project ID")
  .action(async (projectId: string) => {
    const db = createDatabase();

    console.log("");
    console.log(chalk.blue.bold("  API Contract Audit"));
    console.log(DIVIDER);

    const contracts = db
      .select()
      .from(apiContracts)
      .where(eq(apiContracts.projectId, projectId))
      .all();

    if (contracts.length === 0) {
      console.log(chalk.gray("\n  No API contracts registered\n"));
      return;
    }

    let breakingTotal = 0;
    let nonBreakingTotal = 0;

    for (const contract of contracts) {
      const changes = db
        .select()
        .from(apiChanges)
        .where(eq(apiChanges.contractId, contract.id))
        .all();

      const breaking = changes.filter((c) => c.isBreaking === 1);
      const nonBreaking = changes.filter((c) => c.isBreaking === 0);

      breakingTotal += breaking.length;
      nonBreakingTotal += nonBreaking.length;

      const statusIcon = breaking.length > 0 ? chalk.red("✗") : chalk.green("✓");
      const versionStr = `v${contract.version}`;

      console.log("");
      console.log(`  ${statusIcon}  ${chalk.white(`${contract.method} ${contract.path}`)}  ${chalk.gray(versionStr)}`);

      if (contract.description) {
        console.log(chalk.gray(`     ${contract.description}`));
      }

      if (breaking.length > 0) {
        for (const change of breaking) {
          console.log(chalk.red(`     BREAKING: ${change.changeType} — ${change.fieldPath}`));
        }
      }

      if (nonBreaking.length > 0) {
        console.log(chalk.yellow(`     ${nonBreaking.length} non-breaking change(s)`));
      }
    }

    console.log("");
    console.log(DIVIDER);
    console.log(
      `  ${chalk.white("Contracts:")} ${contracts.length}  ${breakingTotal > 0 ? chalk.red(`Breaking: ${breakingTotal}`) : chalk.green("Breaking: 0")}  ${chalk.yellow(`Non-breaking: ${nonBreakingTotal}`)}`,
    );
    console.log("");
  });

// ─── audit naming ───────────────────────────────────────────────────────

auditCommand
  .command("naming")
  .description("Naming convention compliance audit")
  .argument("<project-id>", "Project ID")
  .action(async (projectId: string) => {
    const db = createDatabase();

    console.log("");
    console.log(chalk.blue.bold("  Naming Convention Audit"));
    console.log(DIVIDER);

    const violations = db
      .select()
      .from(namingViolations)
      .where(eq(namingViolations.projectId, projectId))
      .all();

    if (violations.length === 0) {
      console.log(chalk.green("\n  No naming violations found — all conventions followed\n"));
      return;
    }

    // Group by file
    const byFile = new Map<string, typeof violations>();
    for (const v of violations) {
      const existing = byFile.get(v.filePath) ?? [];
      existing.push(v);
      byFile.set(v.filePath, existing);
    }

    for (const [filePath, fileViolations] of byFile) {
      console.log("");
      console.log(chalk.white(`  ${filePath}`));

      for (const v of fileViolations) {
        console.log(
          chalk.red(`    L${v.line}: `) +
          chalk.gray(`"${v.identifier}" — expected ${v.expectedFormat}`) +
          (v.suggestion ? chalk.cyan(` → ${v.suggestion}`) : ""),
        );
      }
    }

    console.log("");
    console.log(DIVIDER);
    console.log(`  ${chalk.white("Total violations:")} ${chalk.red(String(violations.length))} across ${byFile.size} file(s)`);
    console.log("");
  });
