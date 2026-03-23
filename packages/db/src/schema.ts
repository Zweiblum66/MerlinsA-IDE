import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

// ─── Project & Scrum ─────────────────────────────────────────────

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  rootPath: text("root_path").notNull(),
  techStack: text("tech_stack").notNull().default("{}"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const sprints = sqliteTable("sprints", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  number: integer("number").notNull(),
  goal: text("goal").notNull(),
  status: text("status", {
    enum: ["PLANNING", "IN_PROGRESS", "REVIEW", "RETROSPECTIVE", "COMPLETED"],
  }).notNull().default("PLANNING"),
  startDate: integer("start_date", { mode: "timestamp" }),
  endDate: integer("end_date", { mode: "timestamp" }),
  tokenBudget: integer("token_budget").notNull().default(10_000_000),
  tokensUsed: integer("tokens_used").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const epics = sqliteTable("epics", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  priority: integer("priority").notNull().default(0),
  status: text("status", {
    enum: ["BACKLOG", "IN_PROGRESS", "DONE"],
  }).notNull().default("BACKLOG"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const userStories = sqliteTable("user_stories", {
  id: text("id").primaryKey(),
  epicId: text("epic_id")
    .notNull()
    .references(() => epics.id),
  sprintId: text("sprint_id").references(() => sprints.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  acceptanceCriteria: text("acceptance_criteria").notNull().default("[]"), // JSON array
  storyPoints: integer("story_points").notNull().default(1),
  priority: integer("priority").notNull().default(0),
  status: text("status", {
    enum: ["BACKLOG", "PLANNED", "IN_PROGRESS", "REVIEW", "DONE"],
  }).notNull().default("BACKLOG"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userStoryId: text("user_story_id")
    .notNull()
    .references(() => userStories.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  assignedAgent: text("assigned_agent"),
  status: text("status", {
    enum: ["TODO", "IN_PROGRESS", "BLOCKED", "REVIEW", "DONE"],
  }).notNull().default("TODO"),
  scopeFiles: text("scope_files").notNull().default("[]"), // JSON array of file paths
  goalContext: text("goal_context").notNull().default("{}"), // JSON
  dependencies: text("dependencies").notNull().default("[]"), // JSON array of task IDs
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// ─── Agent Tracking ──────────────────────────────────────────────

export const agentSessions = sqliteTable("agent_sessions", {
  id: text("id").primaryKey(),
  agentName: text("agent_name").notNull(),
  taskId: text("task_id").references(() => tasks.id),
  sprintId: text("sprint_id").references(() => sprints.id),
  model: text("model").notNull(),
  status: text("status", {
    enum: ["ACTIVE", "COMPLETED", "FAILED", "PAUSED"],
  }).notNull().default("ACTIVE"),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  endedAt: integer("ended_at", { mode: "timestamp" }),
  tokensUsed: text("tokens_used").notNull().default("{}"), // JSON: {input, output, cacheRead, cacheCreation}
  costUsd: real("cost_usd").notNull().default(0),
  driftScore: integer("drift_score").notNull().default(0),
});

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => agentSessions.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  toolUse: text("tool_use"), // JSON, nullable
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

// ─── API Contract Registry ───────────────────────────────────────

export const apiContracts = sqliteTable("api_contracts", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  path: text("path").notNull(),
  method: text("method", {
    enum: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }).notNull(),
  requestSchema: text("request_schema").notNull().default("{}"), // JSON Schema
  responseSchema: text("response_schema").notNull().default("{}"), // JSON Schema
  description: text("description").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const apiChanges = sqliteTable("api_changes", {
  id: text("id").primaryKey(),
  contractId: text("contract_id")
    .notNull()
    .references(() => apiContracts.id),
  changeType: text("change_type", {
    enum: ["ADDED", "MODIFIED", "REMOVED"],
  }).notNull(),
  fieldPath: text("field_path").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  changedBy: text("changed_by").notNull(),
  isBreaking: integer("is_breaking", { mode: "boolean" }).notNull().default(false),
  changedAt: integer("changed_at", { mode: "timestamp" }).notNull(),
});

// ─── RAG & Codebase Index ────────────────────────────────────────

export const codeChunks = sqliteTable("code_chunks", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  filePath: text("file_path").notNull(),
  startLine: integer("start_line").notNull(),
  endLine: integer("end_line").notNull(),
  chunkType: text("chunk_type", {
    enum: ["function", "class", "interface", "module", "config", "type"],
  }).notNull(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  dependencies: text("dependencies").notNull().default("[]"), // JSON array
  exports: text("exports").notNull().default("[]"), // JSON array
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const embeddings = sqliteTable("embeddings", {
  chunkId: text("chunk_id")
    .primaryKey()
    .references(() => codeChunks.id),
  vector: blob("vector").notNull(), // Float32Array serialized
  model: text("model").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ─── Token Usage Tracking ────────────────────────────────────────

export const tokenUsage = sqliteTable("token_usage", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => agentSessions.id),
  sprintId: text("sprint_id").references(() => sprints.id),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
  cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  model: text("model").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
});

// ─── Naming Convention Violations ────────────────────────────────

export const namingViolations = sqliteTable("naming_violations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  filePath: text("file_path").notNull(),
  line: integer("line").notNull(),
  column: integer("column").notNull().default(0),
  identifierName: text("identifier_name").notNull(),
  expectedFormat: text("expected_format").notNull(),
  rule: text("rule").notNull(),
  severity: text("severity", { enum: ["error", "warning"] }).notNull().default("error"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  detectedAt: integer("detected_at", { mode: "timestamp" }).notNull(),
});
