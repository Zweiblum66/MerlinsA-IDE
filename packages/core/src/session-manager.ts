import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { agentSessions, tokenUsage } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import type { AgentModel } from "./types/agent.js";

/** Pricing per million tokens (USD). */
const MODEL_PRICING: Record<
  AgentModel,
  { input: number; output: number; cacheRead: number; cacheCreation: number }
> = {
  "claude-sonnet-4-20250514": {
    input: 3,
    output: 15,
    cacheRead: 0.3,
    cacheCreation: 3.75,
  },
  "claude-haiku-35-20241022": {
    input: 0.8,
    output: 4,
    cacheRead: 0.08,
    cacheCreation: 1,
  },
  "claude-opus-4-20250115": {
    input: 15,
    output: 75,
    cacheRead: 1.5,
    cacheCreation: 18.75,
  },
};

export interface TokenUsageInput {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

type SessionRecord = typeof agentSessions.$inferSelect;

export class SessionManager {
  async createSession(
    agentName: string,
    taskId: string | null,
    sprintId: string | null,
    model: string,
    db: TheIdeDatabase,
  ): Promise<SessionRecord> {
    const id = uuidv4();
    const now = new Date();

    await db.insert(agentSessions).values({
      id,
      agentName,
      taskId,
      sprintId,
      model,
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

    const results = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, id));

    return results[0];
  }

  async updateSession(
    sessionId: string,
    updates: Partial<{
      status: "ACTIVE" | "COMPLETED" | "FAILED" | "PAUSED";
      tokensUsed: string;
      costUsd: number;
      driftScore: number;
      endedAt: Date;
    }>,
    db: TheIdeDatabase,
  ): Promise<void> {
    await db
      .update(agentSessions)
      .set(updates)
      .where(eq(agentSessions.id, sessionId));
  }

  async endSession(
    sessionId: string,
    status: "COMPLETED" | "FAILED",
    db: TheIdeDatabase,
  ): Promise<void> {
    await db
      .update(agentSessions)
      .set({
        status,
        endedAt: new Date(),
      })
      .where(eq(agentSessions.id, sessionId));
  }

  async getSession(
    sessionId: string,
    db: TheIdeDatabase,
  ): Promise<SessionRecord | null> {
    const results = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, sessionId));

    return results[0] ?? null;
  }

  async getSessionsBySprintId(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<SessionRecord[]> {
    return db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.sprintId, sprintId));
  }

  async recordTokenUsage(
    sessionId: string,
    usage: TokenUsageInput,
    model: AgentModel,
    sprintId: string | null,
    db: TheIdeDatabase,
  ): Promise<void> {
    const pricing = MODEL_PRICING[model];
    const costUsd =
      (usage.input * pricing.input +
        usage.output * pricing.output +
        usage.cacheRead * pricing.cacheRead +
        usage.cacheCreation * pricing.cacheCreation) /
      1_000_000;

    const id = uuidv4();
    const now = new Date();

    await db.insert(tokenUsage).values({
      id,
      sessionId,
      sprintId,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheCreationTokens: usage.cacheCreation,
      costUsd,
      model,
      timestamp: now,
    });

    // Update the session's cumulative token usage
    const session = await this.getSession(sessionId, db);
    if (session) {
      const existing = JSON.parse(session.tokensUsed) as TokenUsageInput;
      const updated: TokenUsageInput = {
        input: existing.input + usage.input,
        output: existing.output + usage.output,
        cacheRead: existing.cacheRead + usage.cacheRead,
        cacheCreation: existing.cacheCreation + usage.cacheCreation,
      };

      const existingCost = session.costUsd;
      await this.updateSession(
        sessionId,
        {
          tokensUsed: JSON.stringify(updated),
          costUsd: existingCost + costUsd,
        },
        db,
      );
    }
  }
}
