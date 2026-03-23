import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { BacklogManager } from "./backlog.js";

describe("BacklogManager", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let backlog: BacklogManager;

  const PROJECT_ID = "proj-1";
  const SPRINT_ID = "sprint-1";

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db);
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

    db.insert(schema.sprints)
      .values({
        id: SPRINT_ID,
        projectId: PROJECT_ID,
        number: 1,
        goal: "Sprint 1",
        status: "PLANNING",
        createdAt: now,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("createEpic()", () => {
    it("creates and returns an epic", async () => {
      const epic = await backlog.createEpic(
        PROJECT_ID,
        "Auth System",
        "Implement authentication",
        db,
      );

      expect(epic).toBeDefined();
      expect(epic.id).toBeDefined();
      expect(epic.title).toBe("Auth System");
      expect(epic.description).toBe("Implement authentication");
      expect(epic.projectId).toBe(PROJECT_ID);
      expect(epic.status).toBe("BACKLOG");
      expect(epic.priority).toBe(0);
    });

    it("creates multiple epics with unique IDs", async () => {
      const epic1 = await backlog.createEpic(
        PROJECT_ID,
        "Epic 1",
        "First",
        db,
      );
      const epic2 = await backlog.createEpic(
        PROJECT_ID,
        "Epic 2",
        "Second",
        db,
      );

      expect(epic1.id).not.toBe(epic2.id);
    });
  });

  describe("createUserStory()", () => {
    it("creates a user story with acceptance criteria", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "Epic", "Desc", db);
      const criteria = ["User can log in", "User sees dashboard"];
      const story = await backlog.createUserStory(
        epic.id,
        "Login flow",
        "As a user I want to log in",
        criteria,
        5,
        db,
      );

      expect(story).toBeDefined();
      expect(story.id).toBeDefined();
      expect(story.title).toBe("Login flow");
      expect(story.description).toBe("As a user I want to log in");
      expect(JSON.parse(story.acceptanceCriteria)).toEqual(criteria);
      expect(story.storyPoints).toBe(5);
      expect(story.status).toBe("BACKLOG");
      expect(story.epicId).toBe(epic.id);
    });
  });

  describe("createTask()", () => {
    it("creates a task with scope files and dependencies", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "Epic", "Desc", db);
      const story = await backlog.createUserStory(
        epic.id,
        "Story",
        "Desc",
        [],
        3,
        db,
      );

      const scopeFiles = ["src/auth.ts", "src/middleware.ts"];
      const dependencies = ["task-dep-1", "task-dep-2"];

      const task = await backlog.createTask(
        story.id,
        "Implement login endpoint",
        "Create POST /api/login",
        "agent-1",
        scopeFiles,
        dependencies,
        db,
      );

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.title).toBe("Implement login endpoint");
      expect(task.description).toBe("Create POST /api/login");
      expect(task.assignedAgent).toBe("agent-1");
      expect(task.status).toBe("TODO");
      expect(JSON.parse(task.scopeFiles)).toEqual(scopeFiles);
      expect(JSON.parse(task.dependencies)).toEqual(dependencies);
      expect(task.userStoryId).toBe(story.id);
    });

    it("creates a task with null assigned agent", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "Epic", "Desc", db);
      const story = await backlog.createUserStory(
        epic.id,
        "Story",
        "Desc",
        [],
        2,
        db,
      );

      const task = await backlog.createTask(
        story.id,
        "Unassigned task",
        "No agent",
        null,
        [],
        [],
        db,
      );

      expect(task.assignedAgent).toBeNull();
    });
  });

  describe("getBacklog()", () => {
    it("returns a nested structure of epics > stories > tasks", async () => {
      const epic = await backlog.createEpic(
        PROJECT_ID,
        "Epic 1",
        "Desc",
        db,
      );
      const story = await backlog.createUserStory(
        epic.id,
        "Story 1",
        "Desc",
        ["AC1"],
        3,
        db,
      );
      await backlog.createTask(
        story.id,
        "Task 1",
        "Desc",
        "agent-1",
        [],
        [],
        db,
      );
      await backlog.createTask(
        story.id,
        "Task 2",
        "Desc",
        "agent-2",
        [],
        [],
        db,
      );

      const result = await backlog.getBacklog(PROJECT_ID, db);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe("Epic 1");
      expect(result[0].stories).toHaveLength(1);
      expect(result[0].stories[0].title).toBe("Story 1");
      expect(result[0].stories[0].tasks).toHaveLength(2);
    });

    it("returns empty array when no epics exist", async () => {
      const result = await backlog.getBacklog(PROJECT_ID, db);
      expect(result).toEqual([]);
    });

    it("handles multiple epics with multiple stories", async () => {
      const epic1 = await backlog.createEpic(
        PROJECT_ID,
        "Epic A",
        "Desc",
        db,
      );
      const epic2 = await backlog.createEpic(
        PROJECT_ID,
        "Epic B",
        "Desc",
        db,
      );

      await backlog.createUserStory(epic1.id, "Story A1", "D", [], 1, db);
      await backlog.createUserStory(epic1.id, "Story A2", "D", [], 2, db);
      await backlog.createUserStory(epic2.id, "Story B1", "D", [], 3, db);

      const result = await backlog.getBacklog(PROJECT_ID, db);

      expect(result).toHaveLength(2);

      const epicA = result.find((e) => e.title === "Epic A");
      const epicB = result.find((e) => e.title === "Epic B");

      expect(epicA!.stories).toHaveLength(2);
      expect(epicB!.stories).toHaveLength(1);
    });
  });

  describe("updateTaskStatus()", () => {
    it("changes a task status to IN_PROGRESS", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );
      const task = await backlog.createTask(
        story.id,
        "T",
        "D",
        null,
        [],
        [],
        db,
      );

      const updated = await backlog.updateTaskStatus(
        task.id,
        "IN_PROGRESS",
        db,
      );
      expect(updated.status).toBe("IN_PROGRESS");
    });

    it("sets completedAt when marking as DONE", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );
      const task = await backlog.createTask(
        story.id,
        "T",
        "D",
        null,
        [],
        [],
        db,
      );

      const updated = await backlog.updateTaskStatus(task.id, "DONE", db);
      expect(updated.status).toBe("DONE");
      expect(updated.completedAt).toBeDefined();
      expect(updated.completedAt).not.toBeNull();
    });

    it("changes status to BLOCKED", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );
      const task = await backlog.createTask(
        story.id,
        "T",
        "D",
        null,
        [],
        [],
        db,
      );

      const updated = await backlog.updateTaskStatus(task.id, "BLOCKED", db);
      expect(updated.status).toBe("BLOCKED");
    });
  });

  describe("getTasksByAgent()", () => {
    it("returns only tasks assigned to the specified agent", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );

      // Assign story to sprint
      sqlite
        .prepare("UPDATE user_stories SET sprint_id = ? WHERE id = ?")
        .run(SPRINT_ID, story.id);

      await backlog.createTask(
        story.id,
        "Agent1 Task",
        "D",
        "agent-1",
        [],
        [],
        db,
      );
      await backlog.createTask(
        story.id,
        "Agent2 Task",
        "D",
        "agent-2",
        [],
        [],
        db,
      );
      await backlog.createTask(
        story.id,
        "Another Agent1 Task",
        "D",
        "agent-1",
        [],
        [],
        db,
      );

      const agent1Tasks = await backlog.getTasksByAgent(
        "agent-1",
        SPRINT_ID,
        db,
      );
      expect(agent1Tasks).toHaveLength(2);
      expect(agent1Tasks.every((t) => t.assignedAgent === "agent-1")).toBe(
        true,
      );
    });

    it("returns empty array when agent has no tasks", async () => {
      const result = await backlog.getTasksByAgent(
        "nonexistent-agent",
        SPRINT_ID,
        db,
      );
      expect(result).toEqual([]);
    });
  });

  describe("getBlockedTasks()", () => {
    it("returns only tasks with BLOCKED status", async () => {
      const epic = await backlog.createEpic(PROJECT_ID, "E", "D", db);
      const story = await backlog.createUserStory(
        epic.id,
        "S",
        "D",
        [],
        1,
        db,
      );

      // Assign story to sprint
      sqlite
        .prepare("UPDATE user_stories SET sprint_id = ? WHERE id = ?")
        .run(SPRINT_ID, story.id);

      const task1 = await backlog.createTask(
        story.id,
        "Normal Task",
        "D",
        null,
        [],
        [],
        db,
      );
      const task2 = await backlog.createTask(
        story.id,
        "Blocked Task",
        "D",
        null,
        [],
        [],
        db,
      );
      const task3 = await backlog.createTask(
        story.id,
        "Done Task",
        "D",
        null,
        [],
        [],
        db,
      );

      await backlog.updateTaskStatus(task2.id, "BLOCKED", db);
      await backlog.updateTaskStatus(task3.id, "DONE", db);

      const blocked = await backlog.getBlockedTasks(SPRINT_ID, db);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].id).toBe(task2.id);
      expect(blocked[0].status).toBe("BLOCKED");
    });

    it("returns empty array when no tasks are blocked", async () => {
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
        .run(SPRINT_ID, story.id);

      await backlog.createTask(story.id, "T", "D", null, [], [], db);

      const blocked = await backlog.getBlockedTasks(SPRINT_ID, db);
      expect(blocked).toEqual([]);
    });
  });
});
