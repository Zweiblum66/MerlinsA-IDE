import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { SprintManager } from "./sprint.js";
import { BacklogManager } from "./backlog.js";

describe("SprintManager", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let sprintManager: SprintManager;
  let backlog: BacklogManager;

  const PROJECT_ID = "proj-1";

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db);
    sprintManager = new SprintManager();
    backlog = new BacklogManager();

    const now = new Date();

    db.insert(schema.projects)
      .values({
        id: PROJECT_ID,
        name: "Test Project",
        rootPath: "/tmp/test",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("createSprint()", () => {
    it("creates a sprint record with correct fields", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Implement auth system",
        5_000_000,
        db,
      );

      expect(sprint).toBeDefined();
      expect(sprint.id).toBeDefined();
      expect(sprint.projectId).toBe(PROJECT_ID);
      expect(sprint.number).toBe(1);
      expect(sprint.goal).toBe("Implement auth system");
      expect(sprint.status).toBe("PLANNING");
      expect(sprint.tokenBudget).toBe(5_000_000);
      expect(sprint.tokensUsed).toBe(0);
      expect(sprint.createdAt).toBeDefined();
    });

    it("creates multiple sprints with unique IDs", async () => {
      const s1 = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Sprint 1",
        1_000_000,
        db,
      );
      const s2 = await sprintManager.createSprint(
        PROJECT_ID,
        2,
        "Sprint 2",
        1_000_000,
        db,
      );

      expect(s1.id).not.toBe(s2.id);
      expect(s1.number).toBe(1);
      expect(s2.number).toBe(2);
    });
  });

  describe("startSprint()", () => {
    it("transitions sprint state to IN_PROGRESS", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      // Need at least one task in the sprint for the guard to pass
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );

      // Assign story to this sprint
      sqlite
        .prepare("UPDATE user_stories SET sprint_id = ? WHERE id = ?")
        .run(sprint.id, story.id);

      await backlog.createTask(story.id, "T", "D", "agent-1", [], [], db);

      const started = await sprintManager.startSprint(sprint.id, db);

      expect(started.status).toBe("IN_PROGRESS");
      expect(started.startDate).toBeDefined();
      expect(started.startDate).not.toBeNull();
    });

    it("throws when guard fails (no tasks)", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      await expect(
        sprintManager.startSprint(sprint.id, db),
      ).rejects.toThrow("Transition guard failed");
    });
  });

  describe("getActiveSprint()", () => {
    it("returns the current IN_PROGRESS sprint for a project", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      // Set up tasks and start the sprint
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );
      sqlite
        .prepare("UPDATE user_stories SET sprint_id = ? WHERE id = ?")
        .run(sprint.id, story.id);
      await backlog.createTask(story.id, "T", "D", "agent-1", [], [], db);

      await sprintManager.startSprint(sprint.id, db);

      const active = await sprintManager.getActiveSprint(PROJECT_ID, db);

      expect(active).not.toBeNull();
      expect(active!.id).toBe(sprint.id);
      expect(active!.status).toBe("IN_PROGRESS");
    });

    it("returns null when no sprint is active", async () => {
      // Create a sprint but don't start it
      await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      const active = await sprintManager.getActiveSprint(PROJECT_ID, db);
      expect(active).toBeNull();
    });
  });

  describe("getSprintProgress()", () => {
    it("calculates progress correctly with mixed task statuses", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        5,
        db,
      );

      sqlite
        .prepare("UPDATE user_stories SET sprint_id = ? WHERE id = ?")
        .run(sprint.id, story.id);

      const task1 = await backlog.createTask(
        story.id,
        "Task 1",
        "D",
        null,
        [],
        [],
        db,
      );
      const task2 = await backlog.createTask(
        story.id,
        "Task 2",
        "D",
        null,
        [],
        [],
        db,
      );
      const task3 = await backlog.createTask(
        story.id,
        "Task 3",
        "D",
        null,
        [],
        [],
        db,
      );
      const task4 = await backlog.createTask(
        story.id,
        "Task 4",
        "D",
        null,
        [],
        [],
        db,
      );

      await backlog.updateTaskStatus(task1.id, "DONE", db);
      await backlog.updateTaskStatus(task2.id, "IN_PROGRESS", db);
      await backlog.updateTaskStatus(task3.id, "BLOCKED", db);
      // task4 stays TODO

      const progress = await sprintManager.getSprintProgress(sprint.id, db);

      expect(progress.total).toBe(4);
      expect(progress.done).toBe(1);
      expect(progress.inProgress).toBe(1);
      expect(progress.blocked).toBe(1);
      expect(progress.percentComplete).toBe(25); // 1 out of 4 = 25%
    });

    it("returns 0% when no tasks exist", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      const progress = await sprintManager.getSprintProgress(sprint.id, db);

      expect(progress.total).toBe(0);
      expect(progress.done).toBe(0);
      expect(progress.inProgress).toBe(0);
      expect(progress.blocked).toBe(0);
      expect(progress.percentComplete).toBe(0);
    });

    it("returns 100% when all tasks are DONE", async () => {
      const sprint = await sprintManager.createSprint(
        PROJECT_ID,
        1,
        "Goal",
        1_000_000,
        db,
      );

      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        2,
        db,
      );

      sqlite
        .prepare("UPDATE user_stories SET sprint_id = ? WHERE id = ?")
        .run(sprint.id, story.id);

      const task1 = await backlog.createTask(
        story.id,
        "T1",
        "D",
        null,
        [],
        [],
        db,
      );
      const task2 = await backlog.createTask(
        story.id,
        "T2",
        "D",
        null,
        [],
        [],
        db,
      );

      await backlog.updateTaskStatus(task1.id, "DONE", db);
      await backlog.updateTaskStatus(task2.id, "DONE", db);

      const progress = await sprintManager.getSprintProgress(sprint.id, db);

      expect(progress.total).toBe(2);
      expect(progress.done).toBe(2);
      expect(progress.percentComplete).toBe(100);
    });
  });
});
