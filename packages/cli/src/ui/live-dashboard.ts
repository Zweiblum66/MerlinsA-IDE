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
import { eq, sql, and, gte } from "drizzle-orm";
import type { TheIdeDatabase } from "@the-ide/db";
import { formatTokenCount, formatCost, formatDuration } from "./progress.js";

// ─── Types ──────────────────────────────────────────────────────────────

interface SprintSnapshot {
  id: string;
  number: number;
  goal: string;
  status: string;
  tokenBudget: number;
  tokensUsed: number;
  startDate: Date | null;
  projectName: string;
}

interface TaskSnapshot {
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  todo: number;
}

interface AgentSnapshot {
  name: string;
  status: string;
  model: string;
  tokensUsed: number;
  costUsd: number;
  driftScore: number;
  taskDescription: string;
  elapsed: string;
}

interface TokenSnapshot {
  byModel: { model: string; input: number; output: number; cost: number }[];
  totalCost: number;
}

interface GuardrailSnapshot {
  apiContractsTotal: number;
  apiDriftCount: number;
  namingViolationCount: number;
}

interface BurndownPoint {
  label: string;
  remaining: number;
  ideal: number;
}

type DashboardView = "overview" | "agents" | "tokens" | "burndown";

const VIEW_LABELS: Record<DashboardView, string> = {
  overview: "Overview",
  agents: "Agents",
  tokens: "Tokens",
  burndown: "Burndown",
};

const VIEWS: DashboardView[] = ["overview", "agents", "tokens", "burndown"];

// ─── Data Fetching ──────────────────────────────────────────────────────

function fetchActiveSprint(db: TheIdeDatabase, projectId: string): SprintSnapshot | null {
  const sprint = db
    .select({
      id: sprints.id,
      number: sprints.number,
      goal: sprints.goal,
      status: sprints.status,
      tokenBudget: sprints.tokenBudget,
      tokensUsed: sprints.tokensUsed,
      startDate: sprints.startDate,
      projectName: projects.name,
    })
    .from(sprints)
    .innerJoin(projects, eq(sprints.projectId, projects.id))
    .where(eq(sprints.projectId, projectId))
    .orderBy(sql`${sprints.number} DESC`)
    .limit(1)
    .get();

  if (!sprint) return null;

  return {
    id: sprint.id,
    number: sprint.number,
    goal: sprint.goal,
    status: sprint.status,
    tokenBudget: sprint.tokenBudget,
    tokensUsed: sprint.tokensUsed,
    startDate: sprint.startDate ? new Date(sprint.startDate) : null,
    projectName: sprint.projectName,
  };
}

function fetchTasks(db: TheIdeDatabase, sprintId: string): TaskSnapshot {
  const rows = db
    .select({ status: tasks.status })
    .from(tasks)
    .innerJoin(userStories, eq(tasks.userStoryId, userStories.id))
    .where(eq(userStories.sprintId, sprintId))
    .all();

  const total = rows.length;
  const done = rows.filter((r) => r.status === "DONE").length;
  const inProgress = rows.filter((r) => r.status === "IN_PROGRESS").length;
  const blocked = rows.filter((r) => r.status === "BLOCKED").length;
  const todo = total - done - inProgress - blocked;

  return { total, done, inProgress, blocked, todo };
}

function fetchAgents(db: TheIdeDatabase, sprintId: string): AgentSnapshot[] {
  const sessions = db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.sprintId, sprintId))
    .all();

  const now = Date.now();

  return sessions.map((s) => {
    const startMs = s.startedAt ? new Date(s.startedAt).getTime() : now;
    const endMs = s.endedAt ? new Date(s.endedAt).getTime() : now;
    const elapsed = formatDuration(endMs - startMs);

    return {
      name: s.agentName,
      status: s.status,
      model: s.model,
      tokensUsed: 0,
      costUsd: s.costUsd,
      driftScore: s.driftScore,
      taskDescription: s.taskId ?? "",
      elapsed,
    };
  });
}

function fetchTokens(db: TheIdeDatabase, sprintId: string): TokenSnapshot {
  const rows = db
    .select({
      model: tokenUsage.model,
      totalInput: sql<number>`sum(${tokenUsage.inputTokens})`,
      totalOutput: sql<number>`sum(${tokenUsage.outputTokens})`,
      totalCost: sql<number>`sum(${tokenUsage.costUsd})`,
    })
    .from(tokenUsage)
    .where(eq(tokenUsage.sprintId, sprintId))
    .groupBy(tokenUsage.model)
    .all();

  const byModel = rows.map((r) => ({
    model: r.model,
    input: r.totalInput ?? 0,
    output: r.totalOutput ?? 0,
    cost: r.totalCost ?? 0,
  }));

  const totalCost = byModel.reduce((sum, m) => sum + m.cost, 0);

  return { byModel, totalCost };
}

function fetchGuardrails(db: TheIdeDatabase, projectId: string): GuardrailSnapshot {
  const contractRows = db
    .select({ id: apiContracts.id })
    .from(apiContracts)
    .where(eq(apiContracts.projectId, projectId))
    .all();

  const breakingChanges = db
    .select({ id: apiChanges.id })
    .from(apiChanges)
    .innerJoin(apiContracts, eq(apiChanges.contractId, apiContracts.id))
    .where(and(eq(apiContracts.projectId, projectId), eq(apiChanges.isBreaking, 1)))
    .all();

  const violations = db
    .select({ id: namingViolations.id })
    .from(namingViolations)
    .where(eq(namingViolations.projectId, projectId))
    .all();

  return {
    apiContractsTotal: contractRows.length,
    apiDriftCount: breakingChanges.length,
    namingViolationCount: violations.length,
  };
}

function computeBurndown(taskSnapshot: TaskSnapshot, sprint: SprintSnapshot): BurndownPoint[] {
  const totalDays = 14; // 2-week sprint
  const points: BurndownPoint[] = [];

  const startMs = sprint.startDate?.getTime() ?? Date.now();
  const nowMs = Date.now();
  const elapsedDays = Math.min(
    Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)),
    totalDays,
  );

  for (let day = 0; day <= totalDays; day++) {
    const ideal = Math.round(taskSnapshot.total * (1 - day / totalDays));
    const remaining =
      day <= elapsedDays
        ? Math.max(0, taskSnapshot.total - Math.round((taskSnapshot.done * day) / Math.max(elapsedDays, 1)))
        : -1; // -1 means future (not yet known)

    points.push({
      label: `D${day}`,
      remaining,
      ideal,
    });
  }

  return points;
}

// ─── Rendering ──────────────────────────────────────────────────────────

const WIDTH = 72;
const DIVIDER = chalk.gray("─".repeat(WIDTH));
const DOUBLE_DIVIDER = chalk.gray("═".repeat(WIDTH));

function pad(text: string, len: number): string {
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "");
  const padLen = Math.max(0, len - stripped.length);
  return text + " ".repeat(padLen);
}

function renderHeader(sprint: SprintSnapshot, view: DashboardView): string {
  const lines: string[] = [];
  const now = new Date().toLocaleTimeString();

  lines.push(DOUBLE_DIVIDER);
  lines.push(
    `  ${chalk.blue.bold("MerlinsA-IDE")} ${chalk.gray("—")} ${chalk.white(sprint.projectName)}  ${chalk.gray(`[${now}]`)}`,
  );
  lines.push(DOUBLE_DIVIDER);

  // Tab bar
  const tabs = VIEWS.map((v) => {
    const label = VIEW_LABELS[v];
    if (v === view) return chalk.bgBlue.white.bold(` ${label} `);
    return chalk.gray(` ${label} `);
  }).join(chalk.gray("│"));

  lines.push(`  ${tabs}`);
  lines.push(DIVIDER);

  // Sprint info
  const statusColor =
    sprint.status === "IN_PROGRESS"
      ? chalk.green
      : sprint.status === "COMPLETED"
        ? chalk.blue
        : sprint.status === "IMPEDIMENT"
          ? chalk.red
          : chalk.yellow;

  lines.push(
    `  ${chalk.white.bold(`Sprint ${sprint.number}`)} ${chalk.gray("—")} ${chalk.white(sprint.goal)}  ${statusColor(`[${sprint.status}]`)}`,
  );

  return lines.join("\n");
}

function renderOverview(
  taskSnap: TaskSnapshot,
  tokenSnap: TokenSnapshot,
  agents: AgentSnapshot[],
  guardrails: GuardrailSnapshot,
  sprint: SprintSnapshot,
): string {
  const lines: string[] = [];

  // Task progress
  lines.push("");
  lines.push(chalk.white.bold("  Tasks"));

  const percent = taskSnap.total > 0 ? Math.round((taskSnap.done / taskSnap.total) * 100) : 0;
  const barWidth = 40;
  const doneWidth = Math.round((taskSnap.done / Math.max(taskSnap.total, 1)) * barWidth);
  const ipWidth = Math.round((taskSnap.inProgress / Math.max(taskSnap.total, 1)) * barWidth);
  const blockWidth = Math.round((taskSnap.blocked / Math.max(taskSnap.total, 1)) * barWidth);
  const todoWidth = barWidth - doneWidth - ipWidth - blockWidth;

  const bar =
    chalk.green("█".repeat(doneWidth)) +
    chalk.cyan("█".repeat(ipWidth)) +
    chalk.red("█".repeat(blockWidth)) +
    chalk.gray("░".repeat(Math.max(0, todoWidth)));

  lines.push(`  ${bar} ${percent}%`);
  lines.push(
    chalk.gray(
      `  ${chalk.green("■")} Done ${taskSnap.done}  ${chalk.cyan("■")} In Progress ${taskSnap.inProgress}  ${chalk.red("■")} Blocked ${taskSnap.blocked}  ${chalk.gray("■")} Todo ${taskSnap.todo}`,
    ),
  );

  // Token budget
  lines.push("");
  lines.push(chalk.white.bold("  Token Budget"));

  const budgetPercent = sprint.tokenBudget > 0 ? Math.round((sprint.tokensUsed / sprint.tokenBudget) * 100) : 0;
  const budgetColor =
    budgetPercent >= 100
      ? chalk.red
      : budgetPercent >= 85
        ? chalk.red
        : budgetPercent >= 70
          ? chalk.yellow
          : chalk.green;

  const budgetBarWidth = 40;
  const budgetFilled = Math.min(Math.round((budgetPercent / 100) * budgetBarWidth), budgetBarWidth);
  const budgetEmpty = budgetBarWidth - budgetFilled;
  const budgetBar = budgetColor("█".repeat(budgetFilled)) + chalk.gray("░".repeat(budgetEmpty));

  const warningLabel =
    budgetPercent >= 100
      ? chalk.red.bold(" EXCEEDED")
      : budgetPercent >= 85
        ? chalk.red(" CRITICAL")
        : budgetPercent >= 70
          ? chalk.yellow(" WARNING")
          : chalk.green(" OK");

  lines.push(`  ${budgetBar} ${budgetPercent}%${warningLabel}`);
  lines.push(
    chalk.gray(
      `  ${formatTokenCount(sprint.tokensUsed)} / ${formatTokenCount(sprint.tokenBudget)} tokens  ${chalk.gray("—")}  ${formatCost(tokenSnap.totalCost)} spent`,
    ),
  );

  // Active agents summary
  lines.push("");
  lines.push(chalk.white.bold("  Active Agents"));

  const activeAgents = agents.filter((a) => a.status === "ACTIVE");
  if (activeAgents.length === 0) {
    lines.push(chalk.gray("  No active agents"));
  } else {
    for (const agent of activeAgents.slice(0, 5)) {
      const driftIndicator =
        agent.driftScore >= 3 ? chalk.red(" ⚠ DRIFT") : agent.driftScore > 0 ? chalk.yellow(` ~${agent.driftScore}`) : "";
      lines.push(
        `  ${chalk.cyan(pad(agent.name, 20))} ${chalk.gray(pad(agent.model, 28))}${driftIndicator}`,
      );
    }
    if (activeAgents.length > 5) {
      lines.push(chalk.gray(`  ... and ${activeAgents.length - 5} more`));
    }
  }

  // Guardrails
  lines.push("");
  lines.push(chalk.white.bold("  Guardrails"));

  const apiStatus =
    guardrails.apiDriftCount > 0
      ? chalk.red(`${guardrails.apiDriftCount} breaking changes`)
      : chalk.green("no drift");
  const namingStatus =
    guardrails.namingViolationCount > 0
      ? chalk.red(`${guardrails.namingViolationCount} violations`)
      : chalk.green("clean");

  lines.push(`  ${chalk.gray("API Contracts:")} ${guardrails.apiContractsTotal} registered, ${apiStatus}`);
  lines.push(`  ${chalk.gray("Naming:")}        ${namingStatus}`);

  return lines.join("\n");
}

function renderAgentsView(agents: AgentSnapshot[]): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(
    `  ${chalk.gray(pad("AGENT", 18))} ${chalk.gray(pad("STATUS", 12))} ${chalk.gray(pad("MODEL", 24))} ${chalk.gray(pad("COST", 10))} ${chalk.gray("DRIFT")}`,
  );
  lines.push(`  ${chalk.gray("─".repeat(68))}`);

  if (agents.length === 0) {
    lines.push(chalk.gray("  No agent sessions in this sprint"));
  }

  for (const agent of agents) {
    const statusColor =
      agent.status === "ACTIVE"
        ? chalk.green
        : agent.status === "COMPLETED"
          ? chalk.blue
          : agent.status === "FAILED"
            ? chalk.red
            : chalk.yellow;

    const driftColor = agent.driftScore >= 3 ? chalk.red : agent.driftScore > 0 ? chalk.yellow : chalk.gray;

    lines.push(
      `  ${chalk.white(pad(agent.name, 18))} ${statusColor(pad(agent.status, 12))} ${chalk.gray(pad(agent.model, 24))} ${chalk.gray(pad(formatCost(agent.costUsd), 10))} ${driftColor(agent.driftScore.toFixed(1))}`,
    );
  }

  // Summary stats
  lines.push("");
  lines.push(DIVIDER);

  const completed = agents.filter((a) => a.status === "COMPLETED").length;
  const failed = agents.filter((a) => a.status === "FAILED").length;
  const active = agents.filter((a) => a.status === "ACTIVE").length;
  const totalCost = agents.reduce((sum, a) => sum + a.costUsd, 0);
  const successRate = agents.length > 0 ? Math.round(((completed) / agents.length) * 100) : 0;

  lines.push(
    `  ${chalk.white("Total:")} ${agents.length}  ${chalk.green(`Completed: ${completed}`)}  ${chalk.cyan(`Active: ${active}`)}  ${chalk.red(`Failed: ${failed}`)}`,
  );
  lines.push(
    `  ${chalk.white("Success Rate:")} ${successRate}%  ${chalk.white("Total Cost:")} ${formatCost(totalCost)}`,
  );

  return lines.join("\n");
}

function renderTokensView(tokenSnap: TokenSnapshot, sprint: SprintSnapshot): string {
  const lines: string[] = [];

  // Budget overview
  lines.push("");
  lines.push(chalk.white.bold("  Budget Overview"));

  const budgetPercent = sprint.tokenBudget > 0 ? Math.round((sprint.tokensUsed / sprint.tokenBudget) * 100) : 0;
  const remaining = Math.max(0, sprint.tokenBudget - sprint.tokensUsed);

  lines.push(`  ${chalk.gray("Allocated:")}  ${formatTokenCount(sprint.tokenBudget)}`);
  lines.push(`  ${chalk.gray("Used:")}       ${formatTokenCount(sprint.tokensUsed)} (${budgetPercent}%)`);
  lines.push(`  ${chalk.gray("Remaining:")}  ${formatTokenCount(remaining)}`);
  lines.push(`  ${chalk.gray("Total Cost:")} ${formatCost(tokenSnap.totalCost)}`);

  // By model breakdown
  lines.push("");
  lines.push(chalk.white.bold("  Usage by Model"));
  lines.push(
    `  ${chalk.gray(pad("MODEL", 28))} ${chalk.gray(pad("INPUT", 12))} ${chalk.gray(pad("OUTPUT", 12))} ${chalk.gray("COST")}`,
  );
  lines.push(`  ${chalk.gray("─".repeat(60))}`);

  if (tokenSnap.byModel.length === 0) {
    lines.push(chalk.gray("  No token usage recorded"));
  }

  for (const model of tokenSnap.byModel) {
    const totalTokens = model.input + model.output;
    const modelBarWidth = 20;
    const modelPercent = sprint.tokensUsed > 0 ? totalTokens / sprint.tokensUsed : 0;
    const modelFilled = Math.round(modelPercent * modelBarWidth);

    lines.push(
      `  ${chalk.cyan(pad(model.model, 28))} ${chalk.gray(pad(formatTokenCount(model.input), 12))} ${chalk.gray(pad(formatTokenCount(model.output), 12))} ${chalk.gray(formatCost(model.cost))}`,
    );
    lines.push(
      `  ${chalk.cyan("█".repeat(modelFilled))}${chalk.gray("░".repeat(modelBarWidth - modelFilled))} ${Math.round(modelPercent * 100)}%`,
    );
  }

  return lines.join("\n");
}

function renderBurndownView(burndown: BurndownPoint[], taskSnap: TaskSnapshot): string {
  const lines: string[] = [];
  const chartHeight = 12;
  const maxTasks = taskSnap.total;

  if (maxTasks === 0) {
    lines.push("");
    lines.push(chalk.gray("  No tasks in this sprint — burndown unavailable"));
    return lines.join("\n");
  }

  lines.push("");
  lines.push(chalk.white.bold("  Sprint Burndown"));
  lines.push("");

  // ASCII chart
  for (let row = chartHeight; row >= 0; row--) {
    const threshold = (row / chartHeight) * maxTasks;
    const label = row === chartHeight ? pad(String(maxTasks), 4) : row === 0 ? pad("0", 4) : pad("", 4);

    let rowStr = chalk.gray(`  ${label}│`);

    for (const point of burndown) {
      const idealHere = point.ideal >= threshold;
      const actualHere = point.remaining >= 0 && point.remaining >= threshold;

      if (actualHere && idealHere) {
        rowStr += chalk.cyan("◆");
      } else if (actualHere) {
        rowStr += point.remaining > point.ideal ? chalk.red("●") : chalk.green("●");
      } else if (idealHere) {
        rowStr += chalk.gray("·");
      } else {
        rowStr += " ";
      }

      rowStr += " ";
    }

    lines.push(rowStr);
  }

  // X axis
  const axisLine = burndown.map(() => "──").join("");
  lines.push(chalk.gray(`      └${axisLine}`));

  const dayLabels = burndown.map((p) => pad(p.label, 2)).join("");
  lines.push(chalk.gray(`       ${dayLabels}`));

  // Legend
  lines.push("");
  lines.push(
    `  ${chalk.gray("·")} Ideal  ${chalk.green("●")} Ahead  ${chalk.red("●")} Behind  ${chalk.cyan("◆")} On track`,
  );
  lines.push(
    `  ${chalk.gray("Remaining:")} ${taskSnap.total - taskSnap.done} tasks  ${chalk.gray("Velocity:")} ${taskSnap.done} done`,
  );

  return lines.join("\n");
}

function renderFooter(): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(DIVIDER);
  lines.push(
    chalk.gray("  ← → switch view  │  r refresh  │  q quit"),
  );
  return lines.join("\n");
}

// ─── Main Loop ──────────────────────────────────────────────────────────

export interface LiveDashboardOptions {
  projectId: string;
  refreshInterval?: number;
}

export async function startLiveDashboard(options: LiveDashboardOptions): Promise<void> {
  const { projectId, refreshInterval = 3000 } = options;
  const db = createDatabase();

  let currentView: DashboardView = "overview";
  let isRunning = true;

  function render(): void {
    const sprint = fetchActiveSprint(db, projectId);

    if (!sprint) {
      console.clear();
      console.log(chalk.red("\n  No sprints found for this project.\n"));
      console.log(chalk.gray("  Create one with: the-ide sprint start <project-id>\n"));
      return;
    }

    const taskSnap = fetchTasks(db, sprint.id);
    const agents = fetchAgents(db, sprint.id);
    const tokenSnap = fetchTokens(db, sprint.id);
    const guardrails = fetchGuardrails(db, projectId);
    const burndown = computeBurndown(taskSnap, sprint);

    console.clear();

    const output: string[] = [];
    output.push(renderHeader(sprint, currentView));

    switch (currentView) {
      case "overview":
        output.push(renderOverview(taskSnap, tokenSnap, agents, guardrails, sprint));
        break;
      case "agents":
        output.push(renderAgentsView(agents));
        break;
      case "tokens":
        output.push(renderTokensView(tokenSnap, sprint));
        break;
      case "burndown":
        output.push(renderBurndownView(burndown, taskSnap));
        break;
    }

    output.push(renderFooter());
    console.log(output.join("\n"));
  }

  // Initial render
  render();

  // Set up refresh interval
  const timer = setInterval(() => {
    if (isRunning) render();
  }, refreshInterval);

  // Handle keyboard input
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (key: string) => {
    if (key === "q" || key === "\u0003") {
      // q or Ctrl+C
      isRunning = false;
      clearInterval(timer);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      console.clear();
      console.log(chalk.gray("\n  Dashboard closed.\n"));
      process.exit(0);
    }

    if (key === "r") {
      render();
      return;
    }

    const currentIdx = VIEWS.indexOf(currentView);

    if (key === "\u001b[C" || key === "l") {
      // Right arrow or l
      currentView = VIEWS[(currentIdx + 1) % VIEWS.length];
      render();
    } else if (key === "\u001b[D" || key === "h") {
      // Left arrow or h
      currentView = VIEWS[(currentIdx - 1 + VIEWS.length) % VIEWS.length];
      render();
    } else if (key === "1") {
      currentView = "overview";
      render();
    } else if (key === "2") {
      currentView = "agents";
      render();
    } else if (key === "3") {
      currentView = "tokens";
      render();
    } else if (key === "4") {
      currentView = "burndown";
      render();
    }
  });
}
