import chalk from "chalk";

export interface DashboardData {
  projectName: string;
  sprintNumber: number;
  sprintGoal: string;
  sprintStatus: string;
  tasksTotal: number;
  tasksDone: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tokenBudget: number;
  tokensUsed: number;
  activeAgents: { name: string; task: string; driftScore: number }[];
  apiContractsTotal: number;
  apiDriftCount: number;
  namingViolations: number;
}

export function renderDashboard(data: DashboardData): string {
  const lines: string[] = [];
  const width = 60;
  const divider = chalk.gray("─".repeat(width));

  lines.push("");
  lines.push(chalk.blue.bold(`  the IDE — ${data.projectName}`));
  lines.push(divider);

  // Sprint info
  lines.push(chalk.white(`  Sprint ${data.sprintNumber}: ${data.sprintGoal}`));
  lines.push(chalk.gray(`  Status: ${data.sprintStatus}`));
  lines.push("");

  // Progress bar
  const progressPercent = data.tasksTotal > 0
    ? Math.round((data.tasksDone / data.tasksTotal) * 100)
    : 0;
  const progressBarLength = 30;
  const filledLength = Math.round((progressPercent / 100) * progressBarLength);
  const progressBar = chalk.green("█".repeat(filledLength)) + chalk.gray("░".repeat(progressBarLength - filledLength));
  lines.push(chalk.white(`  Progress: ${progressBar} ${progressPercent}%`));
  lines.push(chalk.gray(`    Done: ${data.tasksDone}  In Progress: ${data.tasksInProgress}  Blocked: ${data.tasksBlocked}  Total: ${data.tasksTotal}`));
  lines.push("");

  // Token budget
  const budgetPercent = data.tokenBudget > 0
    ? Math.round((data.tokensUsed / data.tokenBudget) * 100)
    : 0;
  const budgetColor = budgetPercent >= 85 ? chalk.red : budgetPercent >= 70 ? chalk.yellow : chalk.green;
  lines.push(chalk.white(`  Tokens: ${budgetColor(`${data.tokensUsed.toLocaleString()} / ${data.tokenBudget.toLocaleString()} (${budgetPercent}%)`)}`));
  lines.push("");

  // Active agents
  if (data.activeAgents.length > 0) {
    lines.push(chalk.white("  Active Agents:"));
    for (const agent of data.activeAgents) {
      const driftWarning = agent.driftScore >= 3 ? chalk.red(" [DRIFT]") : "";
      lines.push(chalk.gray(`    ${agent.name.padEnd(18)} → ${agent.task}${driftWarning}`));
    }
    lines.push("");
  }

  // Guardrails
  lines.push(chalk.white("  Guardrails:"));
  lines.push(chalk.gray(`    API Contracts: ${data.apiContractsTotal} registered, ${data.apiDriftCount > 0 ? chalk.red(`${data.apiDriftCount} drifted`) : chalk.green("0 drifted")}`));
  lines.push(chalk.gray(`    Naming:        ${data.namingViolations > 0 ? chalk.red(`${data.namingViolations} violations`) : chalk.green("0 violations")}`));
  lines.push("");
  lines.push(divider);

  return lines.join("\n");
}
