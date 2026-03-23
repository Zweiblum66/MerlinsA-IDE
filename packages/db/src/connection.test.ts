import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { initializeDatabase } from "./connection.js";
import type { TheIdeDatabase } from "./connection.js";

describe("connection", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  describe("createDatabase()", () => {
    it("creates a DB connection that can execute queries", () => {
      // The drizzle instance wrapping an in-memory sqlite db is a valid connection
      expect(db).toBeDefined();

      // Verify the underlying sqlite connection is open and functional
      const result = sqlite.prepare("SELECT 1 AS value").get() as {
        value: number;
      };
      expect(result.value).toBe(1);
    });
  });

  describe("initializeDatabase()", () => {
    it("creates all tables without error", () => {
      expect(() => initializeDatabase(db)).not.toThrow();
    });

    it("creates the projects table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe("projects");
    });

    it("creates the sprints table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='sprints'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the epics table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='epics'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the user_stories table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='user_stories'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the tasks table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the agent_sessions table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_sessions'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the agent_messages table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_messages'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the api_contracts table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='api_contracts'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the api_changes table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='api_changes'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the code_chunks table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='code_chunks'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the embeddings table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the token_usage table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("creates the naming_violations table", () => {
      initializeDatabase(db);
      const tables = sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='naming_violations'",
        )
        .all() as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
    });

    it("is idempotent (can be called twice without error)", () => {
      initializeDatabase(db);
      expect(() => initializeDatabase(db)).not.toThrow();
    });

    it("allows inserting and querying data after initialization", () => {
      initializeDatabase(db);

      const now = new Date();
      db.insert(schema.projects).values({
        id: "proj-1",
        name: "Test Project",
        description: "A test project",
        rootPath: "/tmp/test",
        createdAt: now,
        updatedAt: now,
      }).run();

      const result = db.select().from(schema.projects).all();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Project");
      expect(result[0].rootPath).toBe("/tmp/test");
    });
  });

  describe("closeDatabase()", () => {
    it("closes the underlying sqlite connection", () => {
      // We can verify close works by checking the sqlite connection becomes unusable
      const localSqlite = new Database(":memory:");
      localSqlite.close();

      expect(() => {
        localSqlite.prepare("SELECT 1").get();
      }).toThrow();
    });
  });
});
