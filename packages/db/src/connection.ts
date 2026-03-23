import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export type TheIdeDatabase = BetterSQLite3Database<typeof schema>;

let cachedDb: TheIdeDatabase | null = null;
let cachedSqlite: Database.Database | null = null;

export function getDbPath(projectRoot?: string): string {
  const dataDir = join(projectRoot ?? process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return join(dataDir, "the-ide.db");
}

export function createDatabase(dbPath?: string): TheIdeDatabase {
  if (cachedDb) return cachedDb;

  const resolvedPath = dbPath ?? getDbPath();
  const sqlite = new Database(resolvedPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  cachedSqlite = sqlite;
  cachedDb = drizzle(sqlite, { schema });

  return cachedDb;
}

export function closeDatabase(): void {
  if (cachedSqlite) {
    cachedSqlite.close();
    cachedSqlite = null;
    cachedDb = null;
  }
}

export function initializeDatabase(db: TheIdeDatabase): void {
  const sqlite = (db as unknown as { session: { client: Database.Database } }).session.client;

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      root_path TEXT NOT NULL,
      tech_stack TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      number INTEGER NOT NULL,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PLANNING',
      start_date INTEGER,
      end_date INTEGER,
      token_budget INTEGER NOT NULL DEFAULT 10000000,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS epics (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'BACKLOG',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_stories (
      id TEXT PRIMARY KEY,
      epic_id TEXT NOT NULL REFERENCES epics(id),
      sprint_id TEXT REFERENCES sprints(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      acceptance_criteria TEXT NOT NULL DEFAULT '[]',
      story_points INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'BACKLOG',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_story_id TEXT NOT NULL REFERENCES user_stories(id),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assigned_agent TEXT,
      status TEXT NOT NULL DEFAULT 'TODO',
      scope_files TEXT NOT NULL DEFAULT '[]',
      goal_context TEXT NOT NULL DEFAULT '{}',
      dependencies TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      task_id TEXT REFERENCES tasks(id),
      sprint_id TEXT REFERENCES sprints(id),
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      tokens_used TEXT NOT NULL DEFAULT '{}',
      cost_usd REAL NOT NULL DEFAULT 0,
      drift_score INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_use TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_contracts (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      path TEXT NOT NULL,
      method TEXT NOT NULL,
      request_schema TEXT NOT NULL DEFAULT '{}',
      response_schema TEXT NOT NULL DEFAULT '{}',
      description TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_changes (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL REFERENCES api_contracts(id),
      change_type TEXT NOT NULL,
      field_path TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL,
      is_breaking INTEGER NOT NULL DEFAULT 0,
      changed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS code_chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      chunk_type TEXT NOT NULL,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      dependencies TEXT NOT NULL DEFAULT '[]',
      exports TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      chunk_id TEXT PRIMARY KEY REFERENCES code_chunks(id),
      vector BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES agent_sessions(id),
      sprint_id TEXT REFERENCES sprints(id),
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      model TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS naming_violations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      file_path TEXT NOT NULL,
      line INTEGER NOT NULL,
      column_num INTEGER NOT NULL DEFAULT 0,
      identifier_name TEXT NOT NULL,
      expected_format TEXT NOT NULL,
      rule TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'error',
      resolved_at INTEGER,
      detected_at INTEGER NOT NULL
    );

    -- FTS5 virtual table for BM25 keyword search on code chunks
    CREATE VIRTUAL TABLE IF NOT EXISTS code_chunks_fts USING fts5(
      name,
      content,
      content='code_chunks',
      content_rowid='rowid'
    );
  `);
}
