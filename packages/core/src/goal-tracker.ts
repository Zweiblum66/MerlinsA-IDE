import type { EventBus } from "./types/events.js";
import type { GoalContext } from "./types/task.js";
import type { AgentRole } from "./types/agent.js";

const DRIFT_THRESHOLD = 3;

interface TaskTracking {
  goalContext: GoalContext;
  driftScore: number;
  agentRole: AgentRole;
}

export class GoalTracker {
  private readonly eventBus: EventBus;
  private readonly activeTasks = new Map<string, TaskTracking>();

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  setGoalContext(
    taskId: string,
    goalContext: GoalContext,
    agentRole: AgentRole = "developer",
  ): void {
    this.activeTasks.set(taskId, {
      goalContext,
      driftScore: 0,
      agentRole,
    });
  }

  checkFileScope(taskId: string, filePath: string): boolean {
    const tracking = this.activeTasks.get(taskId);
    if (!tracking) {
      return false;
    }

    const { scopeFiles, scopeKeywords } = tracking.goalContext;

    // Check direct file match
    for (const scopeFile of scopeFiles) {
      if (
        filePath === scopeFile ||
        filePath.endsWith(`/${scopeFile}`) ||
        scopeFile.endsWith("*") &&
          filePath.startsWith(scopeFile.slice(0, -1))
      ) {
        return true;
      }
    }

    // Check keyword match in file path
    for (const keyword of scopeKeywords) {
      if (filePath.toLowerCase().includes(keyword.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  recordAction(
    taskId: string,
    filePath: string,
    _actionType: string,
  ): void {
    const tracking = this.activeTasks.get(taskId);
    if (!tracking) {
      return;
    }

    const inScope = this.checkFileScope(taskId, filePath);

    if (inScope) {
      tracking.driftScore = Math.max(0, tracking.driftScore - 1);
    } else {
      tracking.driftScore += 1;
    }

    if (tracking.driftScore >= DRIFT_THRESHOLD) {
      void this.eventBus.emit({
        type: "GOAL_DRIFT_DETECTED",
        taskId,
        agentRole: tracking.agentRole,
        driftScore: tracking.driftScore,
      });
    }
  }

  getDriftScore(taskId: string): number {
    const tracking = this.activeTasks.get(taskId);
    return tracking?.driftScore ?? 0;
  }

  resetDriftScore(taskId: string): void {
    const tracking = this.activeTasks.get(taskId);
    if (tracking) {
      tracking.driftScore = 0;
    }
  }

  getActiveGoals(): Map<string, GoalContext> {
    const goals = new Map<string, GoalContext>();
    for (const [taskId, tracking] of this.activeTasks) {
      goals.set(taskId, tracking.goalContext);
    }
    return goals;
  }

  removeGoal(taskId: string): void {
    this.activeTasks.delete(taskId);
  }
}
