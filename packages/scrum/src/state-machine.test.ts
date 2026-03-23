import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { SprintStateMachine } from "./state-machine.js";

describe("SprintStateMachine", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let machine: SprintStateMachine;

  const PROJECT_ID = "proj-1";
  const SPRINT_ID = "sprint-1";
  const EPIC_ID = "epic-1";
  const STORY_ID = "story-1";
  const TASK_ID = "task-1";

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db);
    machine = new SprintStateMachine();

    const now = new Date();

    // Seed a project
    db.insert(schema.projects)
      .values({
        id: PROJECT_ID,
        name: "Test Project",
        rootPath: "/tmp/test",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Seed a sprint in PLANNING state
    db.insert(schema.sprints)
      .values({
        id: SPRINT_ID,
        projectId: PROJECT_ID,
        number: 1,
        goal: "Test sprint",
        status: "PLANNING",
        createdAt: now,
      })
      .run();

    // Seed an epic
    db.insert(schema.epics)
      .values({
        id: EPIC_ID,
        projectId: PROJECT_ID,
        title: "Test Epic",
        createdAt: now,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  function seedStoryAndTask(
    options: {
      storyId?: string;
      taskId?: string;
      taskStatus?: string;
      sprintId?: string;
      assignedAgent?: string | null;
    } = {},
  ) {
    const now = Date.now();
    const storyId = options.storyId ?? STORY_ID;
    const taskId = options.taskId ?? TASK_ID;
    const sprintId = options.sprintId ?? SPRINT_ID;

    // Insert story only if it doesn't already exist (using raw sqlite for sync access)
    const existing = sqlite
      .prepare("SELECT id FROM user_stories WHERE id = ?")
      .get(storyId);
    if (!existing) {
      sqlite
        .prepare(
          "INSERT INTO user_stories (id, epic_id, sprint_id, title, story_points, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(storyId, EPIC_ID, sprintId, "Test Story", 3, "BACKLOG", now);
    }

    sqlite
      .prepare(
        "INSERT INTO tasks (id, user_story_id, title, description, status, assigned_agent, scope_files, dependencies, goal_context, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        taskId,
        storyId,
        "Test Task",
        "",
        options.taskStatus ?? "TODO",
        options.assignedAgent ?? null,
        "[]",
        "[]",
        "{}",
        now,
      );
  }

  describe("getCurrentState()", () => {
    it("returns the current state of a sprint", async () => {
      const state = await machine.getCurrentState(SPRINT_ID, db);
      expect(state).toBe("PLANNING");
    });

    it("throws for a non-existent sprint", async () => {
      await expect(
        machine.getCurrentState("non-existent", db),
      ).rejects.toThrow("Sprint not found: non-existent");
    });
  });

  describe("canTransition()", () => {
    it("returns true for a valid transition with guard passing (PLANNING -> IN_PROGRESS with tasks)", async () => {
      seedStoryAndTask();
      const result = await machine.canTransition(SPRINT_ID, "IN_PROGRESS", db);
      expect(result).toBe(true);
    });

    it("returns false when guard fails (PLANNING -> IN_PROGRESS without tasks)", async () => {
      // No tasks seeded, so the guard should fail
      const result = await machine.canTransition(SPRINT_ID, "IN_PROGRESS", db);
      expect(result).toBe(false);
    });

    it("returns false for an invalid transition (PLANNING -> COMPLETED)", async () => {
      const result = await machine.canTransition(SPRINT_ID, "COMPLETED", db);
      expect(result).toBe(false);
    });

    it("returns false for an invalid transition (PLANNING -> REVIEW)", async () => {
      const result = await machine.canTransition(SPRINT_ID, "REVIEW", db);
      expect(result).toBe(false);
    });

    it("allows IN_PROGRESS -> REVIEW when all tasks are DONE", async () => {
      seedStoryAndTask({ taskStatus: "DONE" });

      // Move sprint to IN_PROGRESS first
      sqlite
        .prepare("UPDATE sprints SET status = 'IN_PROGRESS' WHERE id = ?")
        .run(SPRINT_ID);

      const result = await machine.canTransition(SPRINT_ID, "REVIEW", db);
      expect(result).toBe(true);
    });

    it("rejects IN_PROGRESS -> REVIEW when tasks are still IN_PROGRESS", async () => {
      seedStoryAndTask({ taskStatus: "IN_PROGRESS" });

      sqlite
        .prepare("UPDATE sprints SET status = 'IN_PROGRESS' WHERE id = ?")
        .run(SPRINT_ID);

      const result = await machine.canTransition(SPRINT_ID, "REVIEW", db);
      expect(result).toBe(false);
    });

    it("allows IN_PROGRESS -> IMPEDIMENT when a task is BLOCKED", async () => {
      seedStoryAndTask({ taskStatus: "BLOCKED" });

      sqlite
        .prepare("UPDATE sprints SET status = 'IN_PROGRESS' WHERE id = ?")
        .run(SPRINT_ID);

      const result = await machine.canTransition(SPRINT_ID, "IMPEDIMENT", db);
      expect(result).toBe(true);
    });

    it("allows REVIEW -> RETROSPECTIVE (always passes)", async () => {
      sqlite
        .prepare("UPDATE sprints SET status = 'REVIEW' WHERE id = ?")
        .run(SPRINT_ID);

      const result = await machine.canTransition(
        SPRINT_ID,
        "RETROSPECTIVE",
        db,
      );
      expect(result).toBe(true);
    });

    it("allows RETROSPECTIVE -> COMPLETED (always passes)", async () => {
      sqlite
        .prepare("UPDATE sprints SET status = 'RETROSPECTIVE' WHERE id = ?")
        .run(SPRINT_ID);

      const result = await machine.canTransition(SPRINT_ID, "COMPLETED", db);
      expect(result).toBe(true);
    });
  });

  describe("transition()", () => {
    it("changes state from PLANNING to IN_PROGRESS when guard passes", async () => {
      seedStoryAndTask();

      await machine.transition(SPRINT_ID, "IN_PROGRESS", db);

      const state = await machine.getCurrentState(SPRINT_ID, db);
      expect(state).toBe("IN_PROGRESS");
    });

    it("throws for an invalid transition", async () => {
      await expect(
        machine.transition(SPRINT_ID, "COMPLETED", db),
      ).rejects.toThrow("Invalid transition: PLANNING \u2192 COMPLETED");
    });

    it("throws when guard fails (PLANNING -> IN_PROGRESS without tasks)", async () => {
      await expect(
        machine.transition(SPRINT_ID, "IN_PROGRESS", db),
      ).rejects.toThrow("Transition guard failed: PLANNING \u2192 IN_PROGRESS");
    });

    it("transitions through REVIEW -> RETROSPECTIVE -> COMPLETED", async () => {
      sqlite
        .prepare("UPDATE sprints SET status = 'REVIEW' WHERE id = ?")
        .run(SPRINT_ID);

      await machine.transition(SPRINT_ID, "RETROSPECTIVE", db);
      expect(await machine.getCurrentState(SPRINT_ID, db)).toBe(
        "RETROSPECTIVE",
      );

      await machine.transition(SPRINT_ID, "COMPLETED", db);
      expect(await machine.getCurrentState(SPRINT_ID, db)).toBe("COMPLETED");
    });

    it("transitions from IN_PROGRESS to IMPEDIMENT and back", async () => {
      seedStoryAndTask({ taskStatus: "BLOCKED" });

      sqlite
        .prepare("UPDATE sprints SET status = 'IN_PROGRESS' WHERE id = ?")
        .run(SPRINT_ID);

      await machine.transition(SPRINT_ID, "IMPEDIMENT", db);
      expect(await machine.getCurrentState(SPRINT_ID, db)).toBe("IMPEDIMENT");

      // Unblock the task
      sqlite
        .prepare("UPDATE tasks SET status = 'DONE' WHERE id = ?")
        .run(TASK_ID);

      await machine.transition(SPRINT_ID, "IN_PROGRESS", db);
      expect(await machine.getCurrentState(SPRINT_ID, db)).toBe("IN_PROGRESS");
    });
  });
});
