import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import { TokenBudgetManager } from "./budget.js";

describe("TokenBudgetManager", () => {
  let sqlite: Database.Database;
  let db: ReturnType<typeof drizzle>;
  let manager: TokenBudgetManager;

  const projectId = "proj-1";
  const sprintId = "sprint-1";

  beforeEach(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db as any);
    manager = new TokenBudgetManager(db as any);

    // Seed a project and sprint
    const now = new Date();
    db.insert(schema.projects).values({
      id: projectId,
      name: "Test Project",
      description: "A test project",
      rootPath: "/tmp/test",
      techStack: "{}",
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(schema.sprints).values({
      id: sprintId,
      projectId,
      number: 1,
      goal: "Sprint 1",
      status: "PLANNING",
      tokenBudget: 10_000_000,
      tokensUsed: 0,
      createdAt: now,
    }).run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("should allocate budget for a sprint", async () => {
    await manager.allocateBudget(sprintId, 5_000_000);
    const budget = await manager.getBudget(sprintId);
    expect(budget.total).toBe(5_000_000);
  });

  it("should return correct remaining budget", async () => {
    await manager.allocateBudget(sprintId, 1_000_000);
    const budget = await manager.getBudget(sprintId);
    expect(budget.remaining).toBe(1_000_000);
    expect(budget.used).toBe(0);
    expect(budget.percentUsed).toBe(0);
  });

  it("should update tokensUsed after recordUsage", async () => {
    await manager.allocateBudget(sprintId, 1_000_000);
    await manager.recordUsage(
      sprintId,
      { input: 1000, output: 500, cacheRead: 200, cacheCreation: 100 },
      "claude-sonnet-4-20250514",
    );

    const budget = await manager.getBudget(sprintId);
    expect(budget.used).toBe(1800); // 1000 + 500 + 200 + 100
    expect(budget.remaining).toBe(1_000_000 - 1800);
  });

  it("should return true from isOverBudget when budget is exceeded", async () => {
    await manager.allocateBudget(sprintId, 1000);
    await manager.recordUsage(
      sprintId,
      { input: 600, output: 400, cacheRead: 100, cacheCreation: 0 },
      "claude-sonnet-4-20250514",
    );

    const over = await manager.isOverBudget(sprintId);
    expect(over).toBe(true);
  });

  it("should return false from isOverBudget when within budget", async () => {
    await manager.allocateBudget(sprintId, 1_000_000);
    await manager.recordUsage(
      sprintId,
      { input: 100, output: 50, cacheRead: 0, cacheCreation: 0 },
      "claude-sonnet-4-20250514",
    );

    const over = await manager.isOverBudget(sprintId);
    expect(over).toBe(false);
  });

  it("should return 'ok' warning level when usage is below 70%", async () => {
    await manager.allocateBudget(sprintId, 10_000);
    await manager.recordUsage(
      sprintId,
      { input: 3000, output: 0, cacheRead: 0, cacheCreation: 0 },
      "claude-sonnet-4-20250514",
    );

    const level = await manager.getWarningLevel(sprintId);
    expect(level).toBe("ok");
  });

  it("should return 'warning' level when usage is between 70% and 85%", async () => {
    await manager.allocateBudget(sprintId, 10_000);
    await manager.recordUsage(
      sprintId,
      { input: 7500, output: 0, cacheRead: 0, cacheCreation: 0 },
      "claude-sonnet-4-20250514",
    );

    const level = await manager.getWarningLevel(sprintId);
    expect(level).toBe("warning");
  });

  it("should return 'critical' level when usage is between 85% and 100%", async () => {
    await manager.allocateBudget(sprintId, 10_000);
    await manager.recordUsage(
      sprintId,
      { input: 9000, output: 0, cacheRead: 0, cacheCreation: 0 },
      "claude-sonnet-4-20250514",
    );

    const level = await manager.getWarningLevel(sprintId);
    expect(level).toBe("critical");
  });

  it("should return 'exceeded' level when usage is at or above 100%", async () => {
    await manager.allocateBudget(sprintId, 10_000);
    await manager.recordUsage(
      sprintId,
      { input: 10_000, output: 500, cacheRead: 0, cacheCreation: 0 },
      "claude-sonnet-4-20250514",
    );

    const level = await manager.getWarningLevel(sprintId);
    expect(level).toBe("exceeded");
  });
});
