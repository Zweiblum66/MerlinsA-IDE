import type { GoalTracker } from "../goal-tracker.js";
import type { EventBus } from "../types/events.js";

export function createPostToolUseHook(
  goalTracker: GoalTracker,
  _eventBus: EventBus,
): (
  toolName: string,
  toolInput: Record<string, unknown>,
  toolResult: unknown,
) => void {
  const filesModified = new Set<string>();

  return (
    toolName: string,
    toolInput: Record<string, unknown>,
    _toolResult: unknown,
  ): void => {
    const fileTools = ["FileWrite", "FileEdit", "Write", "Edit"];

    if (!fileTools.includes(toolName)) {
      return;
    }

    const filePath =
      (toolInput.file_path as string | undefined) ??
      (toolInput.filePath as string | undefined) ??
      (toolInput.path as string | undefined);

    if (!filePath) {
      return;
    }

    filesModified.add(filePath);

    // Record the action against all active goals to update drift scores
    const activeGoals = goalTracker.getActiveGoals();
    for (const [taskId] of activeGoals) {
      goalTracker.recordAction(taskId, filePath, toolName);
    }
  };
}

export function createFilesModifiedTracker(): {
  hook: (
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResult: unknown,
  ) => void;
  getFilesModified: () => string[];
} {
  const filesModified = new Set<string>();

  const hook = (
    toolName: string,
    toolInput: Record<string, unknown>,
    _toolResult: unknown,
  ): void => {
    const fileTools = ["FileWrite", "FileEdit", "Write", "Edit"];
    if (!fileTools.includes(toolName)) {
      return;
    }

    const filePath =
      (toolInput.file_path as string | undefined) ??
      (toolInput.filePath as string | undefined) ??
      (toolInput.path as string | undefined);

    if (filePath) {
      filesModified.add(filePath);
    }
  };

  return {
    hook,
    getFilesModified: () => Array.from(filesModified),
  };
}
