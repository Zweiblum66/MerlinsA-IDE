import { describe, it, expect, beforeEach } from "vitest";
import { GoalTracker } from "../goal-tracker.js";
import { createPreToolUseHook } from "./pre-tool-use.js";
import { createPostToolUseHook } from "./post-tool-use.js";
import { createPreCompactHook } from "./pre-compact.js";
import type { EventBus, OrchestratorEvent, EventHandler } from "../types/events.js";
import type { GoalContext } from "../types/task.js";

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

const testGoalContext: GoalContext = {
  description: "Implement authentication module",
  acceptanceCriteria: ["Login works", "Logout works"],
  scopeFiles: ["src/auth/login.ts", "src/auth/logout.ts"],
  scopeKeywords: ["auth"],
};

describe("Hooks", () => {
  let eventBus: ReturnType<typeof createTestEventBus>;
  let goalTracker: GoalTracker;

  beforeEach(() => {
    eventBus = createTestEventBus();
    goalTracker = new GoalTracker(eventBus);
  });

  describe("PreToolUse", () => {
    it("warns on out-of-scope file write", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPreToolUseHook(goalTracker);

      const result = hook("Write", {
        file_path: "src/payments/stripe.ts",
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.message).toBeDefined();
      expect(result.message).toContain("outside the defined scope");
      expect(result.message).toContain("src/payments/stripe.ts");
    });

    it("allows in-scope files without warning", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPreToolUseHook(goalTracker);

      const result = hook("Write", {
        file_path: "src/auth/login.ts",
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it("allows non-file tools without checks", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPreToolUseHook(goalTracker);

      const result = hook("Read", { file_path: "src/payments/stripe.ts" });

      expect(result.shouldBlock).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it("allows file tools when no active goals exist", () => {
      const hook = createPreToolUseHook(goalTracker);

      const result = hook("Write", {
        file_path: "src/anything.ts",
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.message).toBeUndefined();
    });

    it("supports filePath (camelCase) input key", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPreToolUseHook(goalTracker);

      const result = hook("Edit", {
        filePath: "src/payments/stripe.ts",
      });

      expect(result.message).toContain("outside the defined scope");
    });

    it("supports path input key", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPreToolUseHook(goalTracker);

      const result = hook("FileWrite", {
        path: "src/payments/stripe.ts",
      });

      expect(result.message).toContain("outside the defined scope");
    });

    it("includes naming violations when checker is provided", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const namingChecker = {
        checkContent(_content: string, _filePath: string): string[] {
          return ["Variable 'my_var' should be camelCase"];
        },
      };
      const hook = createPreToolUseHook(goalTracker, namingChecker);

      const result = hook("Write", {
        file_path: "src/auth/login.ts",
        content: "const my_var = 1;",
      });

      expect(result.shouldBlock).toBe(false);
      expect(result.message).toContain("Naming convention violations");
      expect(result.message).toContain("my_var");
    });
  });

  describe("PostToolUse", () => {
    it("calls goalTracker.recordAction for file-writing tools", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPostToolUseHook(goalTracker, eventBus);

      // Record an out-of-scope action
      hook("Write", { file_path: "src/payments/stripe.ts" }, {});

      expect(goalTracker.getDriftScore("task-1")).toBe(1);
    });

    it("does not record actions for non-file tools", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPostToolUseHook(goalTracker, eventBus);

      hook("Read", { file_path: "src/payments/stripe.ts" }, {});

      expect(goalTracker.getDriftScore("task-1")).toBe(0);
    });

    it("decrements drift score for in-scope file writes", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPostToolUseHook(goalTracker, eventBus);

      // First go out of scope
      hook("Write", { file_path: "src/payments/stripe.ts" }, {});
      expect(goalTracker.getDriftScore("task-1")).toBe(1);

      // Then come back in scope
      hook("Edit", { file_path: "src/auth/login.ts" }, {});
      expect(goalTracker.getDriftScore("task-1")).toBe(0);
    });

    it("records actions against all active goals", () => {
      const goal2: GoalContext = {
        description: "Build payments",
        acceptanceCriteria: [],
        scopeFiles: ["src/payments/stripe.ts"],
        scopeKeywords: ["payment"],
      };
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      goalTracker.setGoalContext("task-2", goal2, "developer");

      const hook = createPostToolUseHook(goalTracker, eventBus);

      // This file is in scope for task-2 but not task-1
      hook("Write", { file_path: "src/payments/stripe.ts" }, {});

      expect(goalTracker.getDriftScore("task-1")).toBe(1);
      expect(goalTracker.getDriftScore("task-2")).toBe(0);
    });

    it("ignores tool calls without a file path", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPostToolUseHook(goalTracker, eventBus);

      hook("Write", { content: "hello" }, {});

      expect(goalTracker.getDriftScore("task-1")).toBe(0);
    });
  });

  describe("PreCompact", () => {
    it("returns empty string when no active goals", () => {
      const hook = createPreCompactHook(goalTracker);
      expect(hook()).toBe("");
    });

    it("returns string with goal context info", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      const hook = createPreCompactHook(goalTracker);

      const result = hook();

      expect(result).toContain("Active Task Context");
      expect(result).toContain("task-1");
      expect(result).toContain("Implement authentication module");
      expect(result).toContain("Login works");
      expect(result).toContain("src/auth/login.ts");
      expect(result).toContain("auth");
    });

    it("includes drift score warning when drift > 0", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");
      // Record out-of-scope actions to increase drift
      goalTracker.recordAction("task-1", "/unrelated/file.ts", "Write");
      goalTracker.recordAction("task-1", "/unrelated/file2.ts", "Write");

      const hook = createPreCompactHook(goalTracker);
      const result = hook();

      expect(result).toContain("Goal Drift Score = 2");
      expect(result).toContain("Stay focused on the scope files");
    });

    it("does not include drift warning when drift is 0", () => {
      goalTracker.setGoalContext("task-1", testGoalContext, "developer");

      const hook = createPreCompactHook(goalTracker);
      const result = hook();

      expect(result).not.toContain("Goal Drift Score");
    });

    it("includes all active goals", () => {
      goalTracker.setGoalContext(
        "task-1",
        { ...testGoalContext, description: "First task" },
        "developer",
      );
      goalTracker.setGoalContext(
        "task-2",
        { ...testGoalContext, description: "Second task" },
        "qa-engineer",
      );

      const hook = createPreCompactHook(goalTracker);
      const result = hook();

      expect(result).toContain("task-1");
      expect(result).toContain("First task");
      expect(result).toContain("task-2");
      expect(result).toContain("Second task");
    });
  });
});
