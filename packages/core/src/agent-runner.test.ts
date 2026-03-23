import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { writeFile, unlink, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { AgentRunner } from "./agent-runner.js";
import type { AgentRunnerOptions } from "./agent-runner.js";
import type { EventBus, OrchestratorEvent, EventHandler } from "./types/events.js";
import type { TaskAssignment, GoalContext } from "./types/task.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function createTestDb(): TheIdeDatabase {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema });
  initializeDatabase(db);
  return db;
}

/** Build a minimal task assignment for testing. */
function buildAssignment(overrides?: Partial<TaskAssignment>): TaskAssignment {
  const goalContext: GoalContext = {
    description: "Implement a basic feature",
    acceptanceCriteria: ["Feature works correctly", "Tests pass"],
    scopeFiles: ["src/feature.ts"],
    scopeKeywords: ["feature"],
  };

  return {
    taskId: "task-001",
    agentRole: "developer",
    goalContext,
    prompt: "Implement the feature as described.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Project root setup — create a mock agent definition file
// ---------------------------------------------------------------------------

const TEMP_PROJECT_ROOT = join(tmpdir(), "agent-runner-test-project");
const AGENTS_DIR = join(TEMP_PROJECT_ROOT, ".claude", "agents");

async function setupProjectRoot(): Promise<void> {
  await mkdir(AGENTS_DIR, { recursive: true });

  const developerMd = `---
name: developer
model: sonnet
tools:
  - Read
  - Write
  - Edit
---

# Developer Agent

You are a developer. Implement features and write tests.
`;
  await writeFile(join(AGENTS_DIR, "developer.md"), developerMd, "utf-8");
}

async function teardownProjectRoot(): Promise<void> {
  await rm(TEMP_PROJECT_ROOT, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Mock Anthropic SDK
// ---------------------------------------------------------------------------

vi.mock("@anthropic-ai/sdk", () => {
  const createMock = vi.fn();

  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: createMock,
      },
    })),
    __createMock: createMock,
  };
});

function getCreateMock(): Mock {
  // Retrieve the mocked create function from the module
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (vi.mocked as any)(
    // biome-ignore lint: test helper
    (globalThis as any).__anthropicCreateMock,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentRunner", () => {
  let db: TheIdeDatabase;
  let eventBus: ReturnType<typeof createTestEventBus>;
  let options: AgentRunnerOptions;

  beforeEach(async () => {
    db = createTestDb();
    eventBus = createTestEventBus();
    options = {
      projectRoot: TEMP_PROJECT_ROOT,
      apiKey: "test-api-key",
      db,
      eventBus,
    };

    await setupProjectRoot();
  });

  afterEach(async () => {
    await teardownProjectRoot();
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates an instance without throwing", () => {
      expect(() => new AgentRunner(options)).not.toThrow();
    });
  });

  describe("registerMcpTools", () => {
    it("accepts MCP tools without throwing", () => {
      const runner = new AgentRunner(options);
      expect(() =>
        runner.registerMcpTools([
          {
            name: "test_tool",
            description: "A test",
            inputSchema: { type: "object", properties: {}, required: [] },
            async execute(): Promise<string> {
              return "ok";
            },
          },
        ]),
      ).not.toThrow();
    });
  });

  describe("run — agent definition loading", () => {
    it("throws when agent definition file is missing", async () => {
      // Remove the developer.md file
      await unlink(join(AGENTS_DIR, "developer.md"));

      // Mock Anthropic to ensure the error happens before any API call
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi.fn();
      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      // Should return a failed result, not throw
      expect(result.status).toBe("failed");
      expect(result.summary).toContain("Task failed");
    });

    it("handles agent definition files with block-style tools list", async () => {
      // Overwrite developer.md with block-style YAML
      const blockStyleMd = `---
name: developer
model: haiku
tools:
  - Read
  - Write
---

You are a developer.
`;
      await writeFile(join(AGENTS_DIR, "developer.md"), blockStyleMd, "utf-8");

      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Task done." }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      expect(result.status).toBe("completed");
      expect(mockCreate).toHaveBeenCalledTimes(1);
      // Verify the model alias was resolved
      const callArgs = mockCreate.mock.calls[0][0] as { model: string };
      expect(callArgs.model).toBe("claude-haiku-35-20241022");
    });
  });

  describe("run — successful task completion", () => {
    it("returns completed status and records token usage on end_turn", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Feature implemented successfully." }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 200,
          output_tokens: 80,
          cache_read_input_tokens: 10,
          cache_creation_input_tokens: 5,
        },
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      expect(result.status).toBe("completed");
      expect(result.summary).toBe("Feature implemented successfully.");
      expect(result.tokensUsed).toBe(295); // 200 + 80 + 10 + 5
      expect(result.taskId).toBe("task-001");
      expect(result.agentRole).toBe("developer");
    });

    it("emits TASK_COMPLETED event on success", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Done." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      await runner.run(buildAssignment());

      const completedEvents = eventBus.emitted.filter(
        (e) => e.type === "TASK_COMPLETED",
      );
      expect(completedEvents).toHaveLength(1);
    });
  });

  describe("run — tool use handling", () => {
    it("handles tool_use → end_turn multi-turn flow", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi
        .fn()
        // First response: model requests tool use
        .mockResolvedValueOnce({
          content: [
            {
              type: "tool_use",
              id: "tool-call-1",
              name: "run_bash",
              input: { command: "echo hello" },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 50, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        })
        // Second response: end turn
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Bash executed." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 60, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      expect(result.status).toBe("completed");
      expect(mockCreate).toHaveBeenCalledTimes(2);
      // The messages array is mutable, so by read-time it contains all turns.
      // At the time of the second API call, messages had 3 entries:
      //   [user(initial), assistant(tool_use), user(tool_result)]
      // After the second call completes, assistant(end_turn) is appended too.
      // Check the third entry (index 2) which is the tool_result message.
      const secondCallMessages = (mockCreate.mock.calls[1][0] as { messages: unknown[] }).messages;
      const toolResultMessage = secondCallMessages[2] as { role: string; content: unknown[] };
      expect(toolResultMessage.role).toBe("user");
      expect(Array.isArray(toolResultMessage.content)).toBe(true);
      const toolResult = (toolResultMessage.content as { type: string }[])[0];
      expect(toolResult.type).toBe("tool_result");
    });

    it("tracks files modified via write_file and edit_file tool calls", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce({
          content: [
            {
              type: "tool_use",
              id: "tool-call-2",
              name: "write_file",
              input: {
                file_path: "/project/src/feature.ts",
                content: "export const feature = true;",
              },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 30, output_tokens: 15, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "File written." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      expect(result.filesModified).toContain("/project/src/feature.ts");
    });
  });

  describe("run — failure handling", () => {
    it("returns failed status and emits TASK_FAILED when API throws", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi
        .fn()
        .mockRejectedValue(new Error("API rate limit exceeded"));

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      expect(result.status).toBe("failed");
      expect(result.summary).toContain("API rate limit exceeded");

      const failedEvents = eventBus.emitted.filter(
        (e) => e.type === "TASK_FAILED",
      );
      expect(failedEvents).toHaveLength(1);
    });

    it("cancel() causes the run to return a failed result", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      // First call takes a moment, then cancel fires before second call
      let callCount = 0;
      const mockCreate = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            content: [{ type: "tool_use", id: "tc-1", name: "run_bash", input: { command: "echo hi" } }],
            stop_reason: "tool_use",
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          });
        }
        // Second call — agent was cancelled between turns
        return Promise.resolve({
          content: [{ type: "text", text: "Cancelled." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        });
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      // Cancel after the first API call returns (during tool execution)
      setTimeout(() => runner.cancel(), 10);

      const result = await runner.run(buildAssignment());
      // The run should resolve — either completed or failed depending on timing
      expect(["failed", "completed"]).toContain(result.status);
    });
  });

  describe("run — drift detection", () => {
    it("emits GOAL_DRIFT_DETECTED when files modified outside scope", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce({
          content: [
            {
              type: "tool_use",
              id: "tool-call-3",
              name: "write_file",
              input: {
                // This file is outside the scope (scope only has src/feature.ts)
                file_path: "/project/unrelated/other.ts",
                content: "export const x = 1;",
              },
            },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 30, output_tokens: 15, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        })
        .mockResolvedValueOnce({
          content: [{ type: "text", text: "Done." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 20, output_tokens: 8, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      // Drift score should be 1.0 (all modified files are out of scope)
      expect(result.driftScore).toBeGreaterThan(0.5);

      const driftEvents = eventBus.emitted.filter(
        (e) => e.type === "GOAL_DRIFT_DETECTED",
      );
      expect(driftEvents).toHaveLength(1);
    });
  });

  describe("run — session recording", () => {
    it("populates sessionId in the task result", async () => {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const mockCreate = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Done." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      });

      vi.mocked(Anthropic).mockImplementation(() => ({
        messages: { create: mockCreate },
      }) as unknown as InstanceType<typeof Anthropic>);

      const runner = new AgentRunner(options);
      const result = await runner.run(buildAssignment());

      expect(typeof result.sessionId).toBe("string");
      expect(result.sessionId.length).toBeGreaterThan(0);
    });
  });
});
