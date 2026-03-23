import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { SessionManager } from "./session-manager.js";

describe("SessionManager", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let manager: SessionManager;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = OFF");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db);
    manager = new SessionManager();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("createSession()", () => {
    it("creates a DB record and returns it", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      expect(session).toBeDefined();
      expect(session.id).toBeTruthy();
      expect(session.agentName).toBe("developer");
      expect(session.status).toBe("ACTIVE");
      expect(session.model).toBe("claude-sonnet-4-20250514");
      expect(session.driftScore).toBe(0);
    });

    it("stores taskId and sprintId when provided", async () => {
      const session = await manager.createSession(
        "qa-engineer",
        "task-abc",
        "sprint-1",
        "claude-haiku-35-20241022",
        db,
      );

      expect(session.taskId).toBe("task-abc");
      expect(session.sprintId).toBe("sprint-1");
    });
  });

  describe("updateSession()", () => {
    it("applies partial updates to status", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.updateSession(session.id, { status: "PAUSED" }, db);

      const fetched = await manager.getSession(session.id, db);
      expect(fetched?.status).toBe("PAUSED");
    });

    it("applies partial updates to driftScore", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.updateSession(session.id, { driftScore: 5 }, db);

      const fetched = await manager.getSession(session.id, db);
      expect(fetched?.driftScore).toBe(5);
    });

    it("applies partial updates to costUsd", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.updateSession(session.id, { costUsd: 1.23 }, db);

      const fetched = await manager.getSession(session.id, db);
      expect(fetched?.costUsd).toBeCloseTo(1.23);
    });
  });

  describe("endSession()", () => {
    it("sets endedAt and status to COMPLETED", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.endSession(session.id, "COMPLETED", db);

      const fetched = await manager.getSession(session.id, db);
      expect(fetched?.status).toBe("COMPLETED");
      expect(fetched?.endedAt).toBeTruthy();
    });

    it("sets endedAt and status to FAILED", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.endSession(session.id, "FAILED", db);

      const fetched = await manager.getSession(session.id, db);
      expect(fetched?.status).toBe("FAILED");
      expect(fetched?.endedAt).toBeTruthy();
    });
  });

  describe("getSession()", () => {
    it("retrieves session by ID", async () => {
      const session = await manager.createSession(
        "architect",
        "task-1",
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      const fetched = await manager.getSession(session.id, db);
      expect(fetched).toBeDefined();
      expect(fetched?.id).toBe(session.id);
      expect(fetched?.agentName).toBe("architect");
    });

    it("returns null for non-existent session", async () => {
      const fetched = await manager.getSession("nonexistent-id", db);
      expect(fetched).toBeNull();
    });
  });

  describe("getSessionsBySprintId()", () => {
    it("filters sessions by sprint ID correctly", async () => {
      await manager.createSession(
        "developer",
        "task-1",
        "sprint-1",
        "claude-sonnet-4-20250514",
        db,
      );
      await manager.createSession(
        "qa-engineer",
        "task-2",
        "sprint-1",
        "claude-haiku-35-20241022",
        db,
      );
      await manager.createSession(
        "architect",
        "task-3",
        "sprint-2",
        "claude-sonnet-4-20250514",
        db,
      );

      const sprint1Sessions = await manager.getSessionsBySprintId(
        "sprint-1",
        db,
      );
      expect(sprint1Sessions).toHaveLength(2);
      expect(sprint1Sessions.every((s) => s.sprintId === "sprint-1")).toBe(
        true,
      );
    });

    it("returns empty array for sprint with no sessions", async () => {
      const sessions = await manager.getSessionsBySprintId(
        "nonexistent-sprint",
        db,
      );
      expect(sessions).toEqual([]);
    });
  });

  describe("recordTokenUsage()", () => {
    it("inserts a token usage record", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.recordTokenUsage(
        session.id,
        { input: 1000, output: 500, cacheRead: 200, cacheCreation: 100 },
        "claude-sonnet-4-20250514",
        null,
        db,
      );

      // Verify the session's cumulative tokens were updated
      const updated = await manager.getSession(session.id, db);
      expect(updated).toBeDefined();
      const tokensUsed = JSON.parse(updated!.tokensUsed) as {
        input: number;
        output: number;
        cacheRead: number;
        cacheCreation: number;
      };
      expect(tokensUsed.input).toBe(1000);
      expect(tokensUsed.output).toBe(500);
      expect(tokensUsed.cacheRead).toBe(200);
      expect(tokensUsed.cacheCreation).toBe(100);
    });

    it("accumulates token usage across multiple calls", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      await manager.recordTokenUsage(
        session.id,
        { input: 1000, output: 500, cacheRead: 0, cacheCreation: 0 },
        "claude-sonnet-4-20250514",
        null,
        db,
      );

      await manager.recordTokenUsage(
        session.id,
        { input: 2000, output: 1000, cacheRead: 0, cacheCreation: 0 },
        "claude-sonnet-4-20250514",
        null,
        db,
      );

      const updated = await manager.getSession(session.id, db);
      const tokensUsed = JSON.parse(updated!.tokensUsed) as {
        input: number;
        output: number;
        cacheRead: number;
        cacheCreation: number;
      };
      expect(tokensUsed.input).toBe(3000);
      expect(tokensUsed.output).toBe(1500);
    });

    it("calculates cost correctly for sonnet model", async () => {
      const session = await manager.createSession(
        "developer",
        null,
        null,
        "claude-sonnet-4-20250514",
        db,
      );

      // Sonnet pricing: input=$3/M, output=$15/M, cacheRead=$0.3/M, cacheCreation=$3.75/M
      await manager.recordTokenUsage(
        session.id,
        {
          input: 1_000_000,
          output: 1_000_000,
          cacheRead: 1_000_000,
          cacheCreation: 1_000_000,
        },
        "claude-sonnet-4-20250514",
        null,
        db,
      );

      const updated = await manager.getSession(session.id, db);
      // Expected cost: 3 + 15 + 0.3 + 3.75 = 22.05
      expect(updated!.costUsd).toBeCloseTo(22.05, 2);
    });
  });
});
