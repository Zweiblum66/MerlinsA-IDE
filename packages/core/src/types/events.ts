import type { AgentRole } from "./agent.js";
import type { TaskResult } from "./task.js";

export type OrchestratorEvent =
  | { type: "SPRINT_STARTED"; sprintId: string }
  | { type: "TASK_ASSIGNED"; taskId: string; agentRole: AgentRole }
  | { type: "TASK_COMPLETED"; taskId: string; result: TaskResult }
  | { type: "TASK_FAILED"; taskId: string; error: string }
  | { type: "TASK_BLOCKED"; taskId: string; reason: string }
  | {
      type: "GOAL_DRIFT_DETECTED";
      taskId: string;
      agentRole: AgentRole;
      driftScore: number;
    }
  | { type: "GOAL_DRIFT_RESOLVED"; taskId: string }
  | { type: "TOKEN_BUDGET_WARNING"; sprintId: string; percentUsed: number }
  | { type: "TOKEN_BUDGET_EXCEEDED"; sprintId: string }
  | { type: "SPRINT_COMPLETED"; sprintId: string }
  | { type: "API_DRIFT_DETECTED"; contractId: string; details: string }
  | { type: "NAMING_VIOLATION"; filePath: string; violations: string[] };

export type EventHandler = (
  event: OrchestratorEvent,
) => void | Promise<void>;

export interface EventBus {
  emit: (event: OrchestratorEvent) => Promise<void>;
  on: (type: string, handler: EventHandler) => void;
  off: (type: string, handler: EventHandler) => void;
}
