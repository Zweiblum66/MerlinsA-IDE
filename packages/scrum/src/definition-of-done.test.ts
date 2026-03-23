import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { DefinitionOfDoneChecker } from "./definition-of-done.js";

describe("DefinitionOfDoneChecker", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let checker: DefinitionOfDoneChecker;

  const PROJECT_ID = "proj-1";
  const EPIC_ID = "epic-1";
  const STORY_ID = "story-1";
  const TASK_ID = "task-1";

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
    initializeDatabase(db);
    checker = new DefinitionOfDoneChecker();

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

    db.insert(schema.epics)
      .values({
        id: EPIC_ID,
        projectId: PROJECT_ID,
        title: "Test Epic",
        createdAt: now,
      })
      .run();

    db.insert(schema.userStories)
      .values({
        id: STORY_ID,
        epicId: EPIC_ID,
        title: "Test Story",
        acceptanceCriteria: JSON.stringify(["AC1", "AC2"]),
        storyPoints: 3,
        createdAt: now,
      })
      .run();

    db.insert(schema.tasks)
      .values({
        id: TASK_ID,
        userStoryId: STORY_ID,
        title: "Test Task",
        description: "A test task",
        status: "TODO",
        scopeFiles: JSON.stringify(["src/index.ts"]),
        createdAt: now,
      })
      .run();
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("checkTask()", () => {
    it("returns exactly 6 checks", async () => {
      const result = await checker.checkTask(TASK_ID, db);

      expect(result.checks).toHaveLength(6);
    });

    it("returns isPassing as true when all checks pass (placeholder behavior)", async () => {
      const result = await checker.checkTask(TASK_ID, db);

      expect(result.isPassing).toBe(true);
    });

    it("returns the acceptanceCriteriaMet check", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const check = result.checks.find(
        (c) => c.name === "acceptanceCriteriaMet",
      );

      expect(check).toBeDefined();
      expect(check!.isPassing).toBe(true);
      expect(check!.details).toContain("Not yet implemented");
    });

    it("returns the testsPass check", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const check = result.checks.find((c) => c.name === "testsPass");

      expect(check).toBeDefined();
      expect(check!.isPassing).toBe(true);
      expect(check!.details).toContain("Not yet implemented");
    });

    it("returns the noNamingViolations check", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const check = result.checks.find(
        (c) => c.name === "noNamingViolations",
      );

      expect(check).toBeDefined();
      expect(check!.isPassing).toBe(true);
      expect(check!.details).toContain("Not yet implemented");
    });

    it("returns the apiContractsConsistent check", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const check = result.checks.find(
        (c) => c.name === "apiContractsConsistent",
      );

      expect(check).toBeDefined();
      expect(check!.isPassing).toBe(true);
      expect(check!.details).toContain("Not yet implemented");
    });

    it("returns the noTypeErrors check", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const check = result.checks.find((c) => c.name === "noTypeErrors");

      expect(check).toBeDefined();
      expect(check!.isPassing).toBe(true);
      expect(check!.details).toContain("Not yet implemented");
    });

    it("returns the codeReviewApproved check", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const check = result.checks.find(
        (c) => c.name === "codeReviewApproved",
      );

      expect(check).toBeDefined();
      expect(check!.isPassing).toBe(true);
      expect(check!.details).toContain("Not yet implemented");
    });

    it("returns all check names in the expected set", async () => {
      const result = await checker.checkTask(TASK_ID, db);
      const checkNames = result.checks.map((c) => c.name);

      expect(checkNames).toEqual(
        expect.arrayContaining([
          "acceptanceCriteriaMet",
          "testsPass",
          "noNamingViolations",
          "apiContractsConsistent",
          "noTypeErrors",
          "codeReviewApproved",
        ]),
      );
    });

    it("throws for a non-existent task", async () => {
      await expect(checker.checkTask("non-existent", db)).rejects.toThrow(
        "Task not found: non-existent",
      );
    });
  });
});
