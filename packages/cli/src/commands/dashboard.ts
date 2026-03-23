import { Command } from "commander";
import { startLiveDashboard } from "../ui/live-dashboard.js";

export const dashboardCommand = new Command("dashboard")
  .description("Launch the live sprint dashboard with auto-refresh")
  .argument("<project-id>", "Project ID")
  .option("-i, --interval <ms>", "Refresh interval in milliseconds", "3000")
  .action(async (projectId: string, options: { interval: string }) => {
    await startLiveDashboard({
      projectId,
      refreshInterval: parseInt(options.interval, 10),
    });
  });
