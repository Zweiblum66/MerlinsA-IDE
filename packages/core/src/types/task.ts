import type { AgentRole } from "./agent.js";

export interface GoalContext {
  description: string;
  acceptanceCriteria: string[];
  scopeFiles: string[];
  scopeKeywords: string[];
}

export interface TaskAssignment {
  taskId: string;
  agentRole: AgentRole;
  goalContext: GoalContext;
  prompt: string;
}

export interface TaskResult {
  taskId: string;
  agentRole: AgentRole;
  sessionId: string;
  status: "completed" | "failed" | "blocked";
  summary: string;
  filesModified: string[];
  tokensUsed: number;
  driftScore: number;
}
