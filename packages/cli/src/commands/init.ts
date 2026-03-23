import { Command } from "commander";
import { createDatabase, initializeDatabase } from "@the-ide/db";
import { v4 as uuidv4 } from "uuid";
import { projects } from "@the-ide/db";
import chalk from "chalk";
import { resolve } from "node:path";

export const initCommand = new Command("init")
  .description("Initialize a new project in the current directory")
  .argument("[name]", "Project name", "my-project")
  .option("-d, --description <desc>", "Project description", "")
  .option("-p, --path <path>", "Project root path", process.cwd())
  .action(async (name: string, options: { description: string; path: string }) => {
    const rootPath = resolve(options.path);

    console.log(chalk.blue("\n  the IDE — Project Initialization\n"));
    console.log(chalk.gray(`  Project: ${name}`));
    console.log(chalk.gray(`  Path:    ${rootPath}\n`));

    const db = createDatabase();
    initializeDatabase(db);

    const projectId = uuidv4();
    const now = new Date();

    db.insert(projects).values({
      id: projectId,
      name,
      description: options.description,
      rootPath,
      techStack: JSON.stringify({}),
      createdAt: now,
      updatedAt: now,
    }).run();

    console.log(chalk.green("  Project initialized successfully!"));
    console.log(chalk.gray(`  ID: ${projectId}`));
    console.log(chalk.gray(`  Database: ${rootPath}/data/the-ide.db\n`));
    console.log(chalk.blue("  Next steps:"));
    console.log(chalk.white("    1. the-ide sprint start    — Start your first sprint"));
    console.log(chalk.white("    2. the-ide agent status    — Check agent team status"));
    console.log(chalk.white("    3. the-ide report tokens   — View token usage\n"));
  });
