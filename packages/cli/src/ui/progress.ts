import chalk from "chalk";

export interface ProgressBarOptions {
  total: number;
  current: number;
  width?: number;
  label?: string;
  showPercentage?: boolean;
}

export function renderProgressBar(options: ProgressBarOptions): string {
  const { total, current, width = 30, label = "", showPercentage = true } = options;

  const percent = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  const bar = chalk.green("█".repeat(filled)) + chalk.gray("░".repeat(empty));
  const percentText = showPercentage ? ` ${percent}%` : "";
  const labelText = label ? `${label} ` : "";

  return `${labelText}${bar}${percentText}`;
}

export interface SpinnerFrame {
  frames: string[];
  interval: number;
}

export const SPINNER_DOTS: SpinnerFrame = {
  frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  interval: 80,
};

export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export function formatCost(usd: number): string {
  if (usd < 0.01) {
    return `$${usd.toFixed(4)}`;
  }
  return `$${usd.toFixed(2)}`;
}
