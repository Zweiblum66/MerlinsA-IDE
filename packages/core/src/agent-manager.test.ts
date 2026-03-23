import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { AgentManager } from "./agent-manager.js";
import type { EventBus, OrchestratorEvent, EventHandler } from "./types/events.js";
import type { AgentConfig } from "./types/agent.js";
import type { TaskAssignment, GoalContext } from "./types/task.js";

function createTestEventBus(): EventBus & { emitted: OrchestratorEvent[] } {
  const handlers = new Map<string, Set<EventHandler>>();
  const emitted: OrchestratorEvent[] = [];

  return {
    emitted,
    async emit(event: OrchestratorEvent): Promise<void> {
      emitted.push(event);
      const typeHandlers = handlers.get(event.type);
      if (!typeHandlers) return;
      for (const handler of typeHandlers) {
        await handler(event);
      }
    },
    on(type: string, handler: EventHandler): void {
      let set = handlers.get(type);
      if (!set) {
        set = new Set();
        handlers.set(type, set);
      }
      set.add(handler);
    },
    off(type: string, handler: EventHandler): void {
      handlers.get(type)?.delete(handler);
    },
  };
}

const testConfig: AgentConfig = {
  name: "developer",
  displayName: "Developer",
  model: "claude-sonnet-4-20250514",
  description: "Test developer agent",
  tools: ["Read", "Write"],
  mcpServers: [],
  systemPromptPath: "prompts/developer.md",
};

const testGoalContext: GoalContext = {
  description: "Implement feature X",
  acceptanceCriteria: ["Criterion A", "Criterion B"],
  scopeFiles: ["src/feature-x.ts"],
  scopeKeywords: ["feature"],
};

function createAssignment(taskId = "task-1"): TaskAssignment {
  return {
    taskId,
    agentRole: "developer",
    goalContext: testGoalContext,
    prompt: "Implement the feature as described.",
  };
}

describe("AgentManager", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let eventBus: ReturnType<typeof createTestEventBus>;
  let manager: AgentManager;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = OFF");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db);
    eventBus = createTestEventBus();
    manager = new AgentManager(db, eventBus);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("spawnAgent()", () => {
    it("creates a session in DB and returns status", async () => {
      const status = await manager.spawnAgent(testConfig, createAssignment());

      expect(status.agentName).toBe("developer");
      expect(status.sessionId).toBeTruthy();
      expect(status.taskId).toBe("task-1");
      expect(status.status).toBe("active");
      expect(status.driftScore).toBe(0);
      expect(status.tokensUsed).toBe(0);
    });

    it("persists the session to the database", async () => {
      const status = await manager.spawnAgent(testConfig, createAssignment());

      const fetched = await manager.getAgentStatus(status.sessionId!);
      expect(fetched.agentName).toBe("developer");
      expect(fetched.status).toBe("active");
    });

    it("emits TASK_ASSIGNED event", async () => {
      await manager.spawnAgent(testConfig, createAssignment());

      const assigned = eventBus.emitted.find(
        (e) => e.type === "TASK_ASSIGNED",
      );
      expect(assigned).toBeDefined();
      if (assigned && assigned.type === "TASK_ASSIGNED") {
        expect(assigned.taskId).toBe("task-1");
        expect(assigned.agentRole).toBe("developer");
      }
    });
  });

  describe("getAgentStatus()", () => {
    it("returns correct status for existing session", async () => {
      const spawned = await manager.spawnAgent(testConfig, createAssignment());
      const status = await manager.getAgentStatus(spawned.sessionId!);

      expect(status.agentName).toBe("developer");
      expect(status.status).toBe("active");
      expect(status.taskId).toBe("task-1");
    });

    it("throws for non-existent session", async () => {
      await expect(
        manager.getAgentStatus("nonexistent-id"),
      ).rejects.toThrow("Agent session not found: nonexistent-id");
    });
  });

  describe("pauseAgent()", () => {
    it("sets status to paused", async () => {
      const spawned = await manager.spawnAgent(testConfig, createAssignment());
      await manager.pauseAgent(spawned.sessionId!);

      const status = await manager.getAgentStatus(spawned.sessionId!);
      expect(status.status).toBe("paused");
    });
  });

  describe("resumeAgent()", () => {
    it("sets status back to active", async () => {
      const spawned = await manager.spawnAgent(testConfig, createAssignment());
      await manager.pauseAgent(spawned.sessionId!);
      await manager.resumeAgent(spawned.sessionId!);

      const status = await manager.getAgentStatus(spawned.sessionId!);
      expect(status.status).toBe("active");
    });
  });

  describe("completeAgent()", () => {
    it("marks as completed and emits TASK_COMPLETED", async () => {
      const spawned = await manager.spawnAgent(testConfig, createAssignment());
      await manager.completeAgent(spawned.sessionId!, {
        taskId: "task-1",
        agentRole: "developer",
        sessionId: spawned.sessionId!,
        status: "completed",
        summary: "Done",
        filesModified: ["src/feature-x.ts"],
        tokensUsed: 5000,
        driftScore: 1,
      });

      const status = await manager.getAgentStatus(spawned.sessionId!);
      expect(status.status).toBe("completed");
      expect(status.driftScore).toBe(1);

      const completedEvent = eventBus.emitted.find(
        (e) => e.type === "TASK_COMPLETED",
      );
      expect(completedEvent).toBeDefined();
    });
  });

  describe("failAgent()", () => {
    it("marks as failed and emits TASK_FAILED", async () => {
      const spawned = await manager.spawnAgent(testConfig, createAssignment());
      await manager.failAgent(spawned.sessionId!, "Something went wrong");

      const status = await manager.getAgentStatus(spawned.sessionId!);
      expect(status.status).toBe("failed");

      const failedEvent = eventBus.emitted.find(
        (e) => e.type === "TASK_FAILED",
      );
      expect(failedEvent).toBeDefined();
      if (failedEvent && failedEvent.type === "TASK_FAILED") {
        expect(failedEvent.taskId).toBe("task-1");
        expect(failedEvent.error).toBe("Something went wrong");
      }
    });
  });

  describe("getActiveAgents()", () => {
    it("returns only active agents", async () => {
      const a1 = await manager.spawnAgent(
        testConfig,
        createAssignment("task-1"),
      );
      const a2 = await manager.spawnAgent(
        testConfig,
        createAssignment("task-2"),
      );
      await manager.pauseAgent(a1.sessionId!);

      const active = await manager.getActiveAgents();
      expect(active).toHaveLength(1);
      expect(active[0].sessionId).toBe(a2.sessionId);
    });

    it("returns empty array when no agents are active", async () => {
      const active = await manager.getActiveAgents();
      expect(active).toEqual([]);
    });
  });

  describe("buildAgentPrompt()", () => {
    it("includes goal context description", () => {
      const prompt = manager.buildAgentPrompt(createAssignment());
      expect(prompt).toContain("Implement feature X");
    });

    it("includes acceptance criteria", () => {
      const prompt = manager.buildAgentPrompt(createAssignment());
      expect(prompt).toContain("Criterion A");
      expect(prompt).toContain("Criterion B");
      expect(prompt).toContain("## Acceptance Criteria");
    });

    it("includes scope files", () => {
      const prompt = manager.buildAgentPrompt(createAssignment());
      expect(prompt).toContain("src/feature-x.ts");
      expect(prompt).toContain("## Scope Files");
    });

    it("includes scope keywords", () => {
      const prompt = manager.buildAgentPrompt(createAssignment());
      expect(prompt).toContain("feature");
      expect(prompt).toContain("## Scope Keywords");
    });

    it("includes instructions from the assignment prompt", () => {
      const prompt = manager.buildAgentPrompt(createAssignment());
      expect(prompt).toContain("Implement the feature as described.");
    });

    it("includes important guidelines about scope", () => {
      const prompt = manager.buildAgentPrompt(createAssignment());
      expect(prompt).toContain("Only modify files within the defined scope.");
    });
  });
});
