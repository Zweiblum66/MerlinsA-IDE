import { Command } from "commander";
import chalk from "chalk";
import { createDatabase } from "@the-ide/db";
import { apiContracts, apiChanges } from "@the-ide/db";
import { eq, desc } from "drizzle-orm";

export const apiCommand = new Command("api")
  .description("API contract management");

apiCommand
  .command("list")
  .description("List all registered API contracts")
  .argument("<project-id>", "Project ID")
  .action(async (projectId: string) => {
    const db = createDatabase();

    const contracts = db.select().from(apiContracts)
      .where(eq(apiContracts.projectId, projectId))
      .all();

    console.log(chalk.blue("\n  API Contracts\n"));

    if (contracts.length === 0) {
      console.log(chalk.gray("  No contracts registered\n"));
      return;
    }

    for (const contract of contracts) {
      console.log(chalk.white(`  ${contract.method.padEnd(7)} ${contract.path}`));
      console.log(chalk.gray(`    ${contract.description || "No description"}`));
      console.log(chalk.gray(`    Version: ${contract.version}  ID: ${contract.id}`));
      console.log("");
    }
  });

apiCommand
  .command("check")
  .description("Check for API contract drift")
  .argument("<project-id>", "Project ID")
  .action(async (projectId: string) => {
    const db = createDatabase();

    const recentChanges = db.select().from(apiChanges)
      .innerJoin(apiContracts, eq(apiChanges.contractId, apiContracts.id))
      .where(eq(apiContracts.projectId, projectId))
      .orderBy(desc(apiChanges.changedAt))
      .limit(20)
      .all();

    console.log(chalk.blue("\n  API Contract Drift Report\n"));

    if (recentChanges.length === 0) {
      console.log(chalk.green("  No drift detected — all contracts in sync\n"));
      return;
    }

    const breakingChanges = recentChanges.filter(c => c.api_changes.isBreaking);
    const nonBreakingChanges = recentChanges.filter(c => !c.api_changes.isBreaking);

    if (breakingChanges.length > 0) {
      console.log(chalk.red(`  Breaking Changes (${breakingChanges.length}):`));
      for (const change of breakingChanges) {
        console.log(chalk.red(`    ${change.api_changes.changeType} ${change.api_changes.fieldPath}`));
        console.log(chalk.gray(`      Contract: ${change.api_contracts.method} ${change.api_contracts.path}`));
        console.log(chalk.gray(`      By: ${change.api_changes.changedBy}`));
      }
      console.log("");
    }

    if (nonBreakingChanges.length > 0) {
      console.log(chalk.yellow(`  Non-Breaking Changes (${nonBreakingChanges.length}):`));
      for (const change of nonBreakingChanges) {
        console.log(chalk.yellow(`    ${change.api_changes.changeType} ${change.api_changes.fieldPath}`));
        console.log(chalk.gray(`      Contract: ${change.api_contracts.method} ${change.api_contracts.path}`));
      }
      console.log("");
    }
  });
