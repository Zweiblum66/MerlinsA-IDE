import { describe, it, expect, beforeEach } from "vitest";
import { GoalTracker } from "./goal-tracker.js";
import type { EventBus, OrchestratorEvent, EventHandler } from "./types/events.js";
import type { GoalContext } from "./types/task.js";

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

function createGoalContext(overrides?: Partial<GoalContext>): GoalContext {
  return {
    description: "Implement user authentication",
    acceptanceCriteria: ["Users can log in", "Users can log out"],
    scopeFiles: ["src/auth/login.ts", "src/auth/logout.ts", "src/auth/*"],
    scopeKeywords: ["auth", "login"],
    ...overrides,
  };
}

describe("GoalTracker", () => {
  let eventBus: ReturnType<typeof createTestEventBus>;
  let tracker: GoalTracker;

  beforeEach(() => {
    eventBus = createTestEventBus();
    tracker = new GoalTracker(eventBus);
  });

  describe("setGoalContext()", () => {
    it("stores goal and makes it retrievable via getActiveGoals()", () => {
      const goal = createGoalContext();
      tracker.setGoalContext("task-1", goal, "developer");

      const active = tracker.getActiveGoals();
      expect(active.size).toBe(1);
      expect(active.get("task-1")).toEqual(goal);
    });

    it("initialises drift score to 0", () => {
      tracker.setGoalContext("task-1", createGoalContext(), "developer");
      expect(tracker.getDriftScore("task-1")).toBe(0);
    });

    it("defaults agentRole to developer", () => {
      tracker.setGoalContext("task-1", createGoalContext());
      // The default role is verified indirectly: drift event should carry "developer"
      // Trigger drift to verify
      tracker.recordAction("task-1", "/unrelated/file.ts", "Write");
      tracker.recordAction("task-1", "/unrelated/file2.ts", "Write");
      tracker.recordAction("task-1", "/unrelated/file3.ts", "Write");

      const driftEvent = eventBus.emitted.find(
        (e) => e.type === "GOAL_DRIFT_DETECTED",
      );
      expect(driftEvent).toBeDefined();
      if (driftEvent && driftEvent.type === "GOAL_DRIFT_DETECTED") {
        expect(driftEvent.agentRole).toBe("developer");
      }
    });
  });

  describe("checkFileScope()", () => {
    beforeEach(() => {
      tracker.setGoalContext("task-1", createGoalContext(), "developer");
    });

    it("returns true for exact file match", () => {
      expect(tracker.checkFileScope("task-1", "src/auth/login.ts")).toBe(true);
    });

    it("returns true when filePath ends with a scope file", () => {
      expect(
        tracker.checkFileScope("task-1", "/project/src/auth/login.ts"),
      ).toBe(true);
    });

    it("returns true for wildcard scope match", () => {
      expect(
        tracker.checkFileScope("task-1", "src/auth/middleware.ts"),
      ).toBe(true);
    });

    it("returns true for keyword match in file path (case insensitive)", () => {
      expect(
        tracker.checkFileScope("task-1", "packages/core/src/Auth/helper.ts"),
      ).toBe(true);
    });

    it("returns false for out-of-scope files", () => {
      expect(
        tracker.checkFileScope("task-1", "src/payments/stripe.ts"),
      ).toBe(false);
    });

    it("returns false for unknown task ID", () => {
      expect(tracker.checkFileScope("nonexistent", "src/auth/login.ts")).toBe(
        false,
      );
    });
  });

  describe("recordAction()", () => {
    beforeEach(() => {
      tracker.setGoalContext("task-1", createGoalContext(), "developer");
    });

    it("increments drift score for out-of-scope file", () => {
      tracker.recordAction("task-1", "src/payments/stripe.ts", "Write");
      expect(tracker.getDriftScore("task-1")).toBe(1);
    });

    it("decrements drift score for in-scope file (min 0)", () => {
      // Start at 0, decrement should stay at 0
      tracker.recordAction("task-1", "src/auth/login.ts", "Write");
      expect(tracker.getDriftScore("task-1")).toBe(0);
    });

    it("decrements drift score after it was increased", () => {
      tracker.recordAction("task-1", "src/payments/stripe.ts", "Write");
      tracker.recordAction("task-1", "src/payments/billing.ts", "Write");
      expect(tracker.getDriftScore("task-1")).toBe(2);

      tracker.recordAction("task-1", "src/auth/login.ts", "Write");
      expect(tracker.getDriftScore("task-1")).toBe(1);
    });

    it("emits GOAL_DRIFT_DETECTED when drift score reaches threshold (3)", () => {
      tracker.recordAction("task-1", "/unrelated/a.ts", "Write");
      tracker.recordAction("task-1", "/unrelated/b.ts", "Write");
      expect(eventBus.emitted).toHaveLength(0);

      tracker.recordAction("task-1", "/unrelated/c.ts", "Write");

      const driftEvents = eventBus.emitted.filter(
        (e) => e.type === "GOAL_DRIFT_DETECTED",
      );
      expect(driftEvents).toHaveLength(1);

      const event = driftEvents[0];
      if (event.type === "GOAL_DRIFT_DETECTED") {
        expect(event.taskId).toBe("task-1");
        expect(event.agentRole).toBe("developer");
        expect(event.driftScore).toBe(3);
      }
    });

    it("emits GOAL_DRIFT_DETECTED on every action above threshold", () => {
      tracker.recordAction("task-1", "/x/a.ts", "Write");
      tracker.recordAction("task-1", "/x/b.ts", "Write");
      tracker.recordAction("task-1", "/x/c.ts", "Write");
      tracker.recordAction("task-1", "/x/d.ts", "Write");

      const driftEvents = eventBus.emitted.filter(
        (e) => e.type === "GOAL_DRIFT_DETECTED",
      );
      expect(driftEvents).toHaveLength(2);
    });

    it("does nothing for unknown task ID", () => {
      tracker.recordAction("nonexistent", "src/auth/login.ts", "Write");
      expect(tracker.getDriftScore("nonexistent")).toBe(0);
    });
  });

  describe("resetDriftScore()", () => {
    it("resets drift score to 0", () => {
      tracker.setGoalContext("task-1", createGoalContext(), "developer");
      tracker.recordAction("task-1", "/unrelated/a.ts", "Write");
      tracker.recordAction("task-1", "/unrelated/b.ts", "Write");
      expect(tracker.getDriftScore("task-1")).toBe(2);

      tracker.resetDriftScore("task-1");
      expect(tracker.getDriftScore("task-1")).toBe(0);
    });

    it("is a no-op for unknown task ID", () => {
      // Should not throw
      tracker.resetDriftScore("nonexistent");
    });
  });

  describe("getActiveGoals()", () => {
    it("returns empty map when no goals set", () => {
      expect(tracker.getActiveGoals().size).toBe(0);
    });

    it("returns all active goals", () => {
      const goal1 = createGoalContext({ description: "Goal 1" });
      const goal2 = createGoalContext({ description: "Goal 2" });
      tracker.setGoalContext("task-1", goal1, "developer");
      tracker.setGoalContext("task-2", goal2, "qa-engineer");

      const active = tracker.getActiveGoals();
      expect(active.size).toBe(2);
      expect(active.get("task-1")?.description).toBe("Goal 1");
      expect(active.get("task-2")?.description).toBe("Goal 2");
    });

    it("excludes removed goals", () => {
      tracker.setGoalContext("task-1", createGoalContext(), "developer");
      tracker.setGoalContext("task-2", createGoalContext(), "developer");
      tracker.removeGoal("task-1");

      expect(tracker.getActiveGoals().size).toBe(1);
      expect(tracker.getActiveGoals().has("task-1")).toBe(false);
    });
  });
});
