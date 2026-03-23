import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { agentSessions } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import type { EventBus } from "./types/events.js";
import type { AgentConfig, AgentRole, AgentStatus } from "./types/agent.js";
import type { TaskAssignment, TaskResult } from "./types/task.js";

export class AgentManager {
  private readonly db: TheIdeDatabase;
  private readonly eventBus: EventBus;

  constructor(db: TheIdeDatabase, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  async spawnAgent(
    config: AgentConfig,
    assignment: TaskAssignment,
  ): Promise<AgentStatus> {
    const sessionId = uuidv4();
    const now = new Date();

    await this.db.insert(agentSessions).values({
      id: sessionId,
      agentName: config.name,
      taskId: assignment.taskId,
      model: config.model,
      status: "ACTIVE",
      startedAt: now,
      tokensUsed: JSON.stringify({
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
      }),
      costUsd: 0,
      driftScore: 0,
    });

    await this.eventBus.emit({
      type: "TASK_ASSIGNED",
      taskId: assignment.taskId,
      agentRole: config.name,
    });

    return {
      agentName: config.name,
      sessionId,
      taskId: assignment.taskId,
      status: "active",
      driftScore: 0,
      tokensUsed: 0,
    };
  }

  async getAgentStatus(sessionId: string): Promise<AgentStatus> {
    const results = await this.db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId));

    if (results.length === 0) {
      throw new Error(`Agent session not found: ${sessionId}`);
    }

    const session = results[0];
    const tokensUsed = JSON.parse(session.tokensUsed) as {
      input: number;
      output: number;
      cacheRead: number;
      cacheCreation: number;
    };
    const totalTokens =
      tokensUsed.input +
      tokensUsed.output +
      tokensUsed.cacheRead +
      tokensUsed.cacheCreation;

    return {
      agentName: session.agentName as AgentRole,
      sessionId: session.id,
      taskId: session.taskId,
      status: session.status.toLowerCase() as AgentStatus["status"],
      driftScore: session.driftScore,
      tokensUsed: totalTokens,
    };
  }

  async pauseAgent(sessionId: string): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({ status: "PAUSED" })
      .where(eq(agentSessions.id, sessionId));
  }

  async resumeAgent(sessionId: string): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({ status: "ACTIVE" })
      .where(eq(agentSessions.id, sessionId));
  }

  async completeAgent(
    sessionId: string,
    result: TaskResult,
  ): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({
        status: "COMPLETED",
        endedAt: new Date(),
        driftScore: result.driftScore,
      })
      .where(eq(agentSessions.id, sessionId));

    await this.eventBus.emit({
      type: "TASK_COMPLETED",
      taskId: result.taskId,
      result,
    });
  }

  async failAgent(sessionId: string, error: string): Promise<void> {
    const results = await this.db
      .select({ taskId: agentSessions.taskId })
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId));

    await this.db
      .update(agentSessions)
      .set({
        status: "FAILED",
        endedAt: new Date(),
      })
      .where(eq(agentSessions.id, sessionId));

    if (results.length > 0 && results[0].taskId) {
      await this.eventBus.emit({
        type: "TASK_FAILED",
        taskId: results[0].taskId,
        error,
      });
    }
  }

  async getActiveAgents(): Promise<AgentStatus[]> {
    const results = await this.db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.status, "ACTIVE"));

    return results.map((session) => {
      const tokensUsed = JSON.parse(session.tokensUsed) as {
        input: number;
        output: number;
        cacheRead: number;
        cacheCreation: number;
      };
      const totalTokens =
        tokensUsed.input +
        tokensUsed.output +
        tokensUsed.cacheRead +
        tokensUsed.cacheCreation;

      return {
        agentName: session.agentName as AgentRole,
        sessionId: session.id,
        taskId: session.taskId,
        status: "active" as const,
        driftScore: session.driftScore,
        tokensUsed: totalTokens,
      };
    });
  }

  buildAgentPrompt(assignment: TaskAssignment): string {
    const { goalContext, prompt } = assignment;

    const sections: string[] = [
      `# Task Assignment`,
      ``,
      `## Goal`,
      goalContext.description,
      ``,
      `## Acceptance Criteria`,
      ...goalContext.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`),
      ``,
      `## Scope Files`,
      ...goalContext.scopeFiles.map((f) => `- ${f}`),
      ``,
      `## Scope Keywords`,
      ...goalContext.scopeKeywords.map((k) => `- ${k}`),
      ``,
      `## Instructions`,
      prompt,
      ``,
      `## Important`,
      `- Only modify files within the defined scope.`,
      `- If you need to modify files outside scope, document the reason.`,
      `- Follow the project naming conventions (camelCase for variables/functions, PascalCase for types/interfaces/classes).`,
      `- Ensure all changes align with the acceptance criteria.`,
    ];

    return sections.join("\n");
  }
}
