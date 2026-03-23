import type { GoalTracker } from "../goal-tracker.js";

export interface PreToolUseResult {
  shouldBlock: boolean;
  message?: string;
}

export interface NamingChecker {
  checkContent(content: string, filePath: string): string[];
}

export function createPreToolUseHook(
  goalTracker: GoalTracker,
  namingChecker?: NamingChecker,
): (
  toolName: string,
  toolInput: Record<string, unknown>,
) => PreToolUseResult {
  return (
    toolName: string,
    toolInput: Record<string, unknown>,
  ): PreToolUseResult => {
    const fileTools = ["FileWrite", "FileEdit", "Write", "Edit"];

    if (!fileTools.includes(toolName)) {
      return { shouldBlock: false };
    }

    const filePath =
      (toolInput.file_path as string | undefined) ??
      (toolInput.filePath as string | undefined) ??
      (toolInput.path as string | undefined);

    if (!filePath) {
      return { shouldBlock: false };
    }

    // Check scope across all active goals
    const activeGoals = goalTracker.getActiveGoals();
    let inAnyScope = false;
    let matchedTaskId: string | null = null;

    for (const [taskId] of activeGoals) {
      if (goalTracker.checkFileScope(taskId, filePath)) {
        inAnyScope = true;
        matchedTaskId = taskId;
        break;
      }
    }

    const warnings: string[] = [];

    if (!inAnyScope && activeGoals.size > 0) {
      warnings.push(
        `Warning: File "${filePath}" is outside the defined scope. ` +
          `This action will increase the goal drift score.`,
      );
    }

    // Check naming conventions if a checker is provided
    if (namingChecker) {
      const content =
        (toolInput.content as string | undefined) ??
        (toolInput.new_string as string | undefined) ??
        (toolInput.newString as string | undefined);

      if (content) {
        const violations = namingChecker.checkContent(content, filePath);
        if (violations.length > 0) {
          warnings.push(
            `Naming convention violations detected:\n` +
              violations.map((v) => `  - ${v}`).join("\n"),
          );
        }
      }
    }

    if (warnings.length > 0) {
      return {
        shouldBlock: false,
        message: warnings.join("\n\n"),
      };
    }

    return { shouldBlock: false };
  };
}
