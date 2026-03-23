import type { GoalTracker } from "../goal-tracker.js";

export function createPreCompactHook(
  goalTracker: GoalTracker,
): () => string {
  return (): string => {
    const activeGoals = goalTracker.getActiveGoals();

    if (activeGoals.size === 0) {
      return "";
    }

    const sections: string[] = [
      "# Active Task Context (preserved across compaction)",
      "",
    ];

    for (const [taskId, goalContext] of activeGoals) {
      sections.push(`## Task: ${taskId}`);
      sections.push("");
      sections.push(`### Description`);
      sections.push(goalContext.description);
      sections.push("");

      if (goalContext.acceptanceCriteria.length > 0) {
        sections.push(`### Acceptance Criteria`);
        for (const criterion of goalContext.acceptanceCriteria) {
          sections.push(`- ${criterion}`);
        }
        sections.push("");
      }

      if (goalContext.scopeFiles.length > 0) {
        sections.push(`### Scope Files`);
        for (const file of goalContext.scopeFiles) {
          sections.push(`- ${file}`);
        }
        sections.push("");
      }

      if (goalContext.scopeKeywords.length > 0) {
        sections.push(`### Scope Keywords`);
        for (const keyword of goalContext.scopeKeywords) {
          sections.push(`- ${keyword}`);
        }
        sections.push("");
      }

      const driftScore = goalTracker.getDriftScore(taskId);
      if (driftScore > 0) {
        sections.push(
          `### Warning: Goal Drift Score = ${driftScore}`,
        );
        sections.push(
          `Stay focused on the scope files and acceptance criteria listed above.`,
        );
        sections.push("");
      }

      sections.push("---");
      sections.push("");
    }

    return sections.join("\n");
  };
}
