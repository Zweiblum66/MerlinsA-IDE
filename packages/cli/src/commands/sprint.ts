import { Command } from "commander";
import chalk from "chalk";
import { createDatabase } from "@the-ide/db";
import { sprints, tasks, userStories } from "@the-ide/db";
import { eq } from "drizzle-orm";

export const sprintCommand = new Command("sprint")
  .description("Sprint management commands");

sprintCommand
  .command("start")
  .description("Start a new sprint")
  .argument("<project-id>", "Project ID")
  .option("-g, --goal <goal>", "Sprint goal", "")
  .option("-b, --budget <tokens>", "Token budget", "10000000")
  .action(async (projectId: string, options: { goal: string; budget: string }) => {
    const db = createDatabase();

    const existingSprints = db.select().from(sprints)
      .where(eq(sprints.projectId, projectId))
      .all();

    const sprintNumber = existingSprints.length + 1;
    const { v4: uuidv4 } = await import("uuid");
    const sprintId = uuidv4();
    const now = new Date();

    db.insert(sprints).values({
      id: sprintId,
      projectId,
      number: sprintNumber,
      goal: options.goal || `Sprint ${sprintNumber}`,
      status: "PLANNING",
      tokenBudget: parseInt(options.budget, 10),
      tokensUsed: 0,
      createdAt: now,
    }).run();

    console.log(chalk.blue(`\n  Sprint ${sprintNumber} created`));
    console.log(chalk.gray(`  ID:     ${sprintId}`));
    console.log(chalk.gray(`  Goal:   ${options.goal || `Sprint ${sprintNumber}`}`));
    console.log(chalk.gray(`  Budget: ${parseInt(options.budget, 10).toLocaleString()} tokens\n`));
  });

sprintCommand
  .command("status")
  .description("Show current sprint status")
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

    const sprintTasks = db.select().from(tasks)
      .innerJoin(userStories, eq(tasks.userStoryId, userStories.id))
      .where(eq(userStories.sprintId, sprintId))
      .all();

    const totalTasks = sprintTasks.length;
    const doneTasks = sprintTasks.filter(t => t.tasks.status === "DONE").length;
    const inProgressTasks = sprintTasks.filter(t => t.tasks.status === "IN_PROGRESS").length;
    const blockedTasks = sprintTasks.filter(t => t.tasks.status === "BLOCKED").length;
    const percentComplete = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    const budgetPercent = sprint.tokenBudget > 0
      ? Math.round((sprint.tokensUsed / sprint.tokenBudget) * 100)
      : 0;

    console.log(chalk.blue(`\n  Sprint ${sprint.number} — ${sprint.goal}`));
    console.log(chalk.gray(`  Status: ${sprint.status}`));
    console.log("");
    console.log(chalk.white("  Progress:"));
    console.log(chalk.green(`    Done:        ${doneTasks}/${totalTasks} (${percentComplete}%)`));
    console.log(chalk.yellow(`    In Progress: ${inProgressTasks}`));
    console.log(chalk.red(`    Blocked:     ${blockedTasks}`));
    console.log("");
    console.log(chalk.white("  Token Budget:"));
    console.log(chalk.gray(`    Used:      ${sprint.tokensUsed.toLocaleString()} / ${sprint.tokenBudget.toLocaleString()}`));
    console.log(chalk.gray(`    Remaining: ${(sprint.tokenBudget - sprint.tokensUsed).toLocaleString()} (${100 - budgetPercent}%)\n`));
  });

sprintCommand
  .command("review")
  .description("Generate sprint review report")
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

    console.log(chalk.blue(`\n  Sprint ${sprint.number} Review — ${sprint.goal}`));
    console.log(chalk.gray(`  Status: ${sprint.status}`));
    console.log(chalk.gray(`  Tokens used: ${sprint.tokensUsed.toLocaleString()}\n`));
    console.log(chalk.yellow("  (Full review report requires running the ScrumMaster agent)\n"));
  });
