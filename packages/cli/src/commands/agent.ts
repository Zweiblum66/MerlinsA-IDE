import { Command } from "commander";
import chalk from "chalk";
import { createDatabase } from "@the-ide/db";
import { agentSessions } from "@the-ide/db";
import { eq } from "drizzle-orm";

export const agentCommand = new Command("agent")
  .description("Agent team management");

agentCommand
  .command("status")
  .description("Show status of all agents")
  .action(async () => {
    const db = createDatabase();

    const sessions = db.select().from(agentSessions)
      .where(eq(agentSessions.status, "ACTIVE"))
      .all();

    console.log(chalk.blue("\n  Agent Team Status\n"));

    if (sessions.length === 0) {
      console.log(chalk.gray("  No active agents\n"));
      return;
    }

    for (const session of sessions) {
      const tokenData = JSON.parse(session.tokensUsed);
      const totalTokens = (tokenData.input || 0) + (tokenData.output || 0);

      const driftIndicator = session.driftScore >= 3
        ? chalk.red(" [DRIFT]")
        : session.driftScore >= 1
        ? chalk.yellow(` [drift:${session.driftScore}]`)
        : "";

      console.log(chalk.white(`  ${session.agentName}`));
      console.log(chalk.gray(`    Session: ${session.id}`));
      console.log(chalk.gray(`    Model:   ${session.model}`));
      console.log(chalk.gray(`    Task:    ${session.taskId || "none"}`));
      console.log(chalk.gray(`    Tokens:  ${totalTokens.toLocaleString()}`));
      console.log(chalk.gray(`    Cost:    $${session.costUsd.toFixed(4)}${driftIndicator}`));
      console.log("");
    }
  });

agentCommand
  .command("list")
  .description("List all agent definitions")
  .action(() => {
    const agentDefinitions = [
      { name: "product-owner", model: "sonnet", role: "Product Owner" },
      { name: "scrum-master", model: "sonnet", role: "Scrum Master" },
      { name: "architect", model: "sonnet", role: "Tech Lead" },
      { name: "developer", model: "sonnet", role: "Dev Team" },
      { name: "qa-engineer", model: "haiku", role: "QA" },
      { name: "devops-engineer", model: "haiku", role: "DevOps" },
      { name: "api-guardian", model: "haiku", role: "API Guard" },
    ];

    console.log(chalk.blue("\n  Agent Team\n"));

    for (const agent of agentDefinitions) {
      console.log(chalk.white(`  ${agent.name.padEnd(18)} ${chalk.gray(agent.role.padEnd(14))} ${chalk.cyan(agent.model)}`));
    }

    console.log("");
  });
