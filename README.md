# MerlinsA-IDE — AI Vibe Coding & Agent-Based IDE

An AI-powered IDE orchestration layer built on Claude Code that organizes development through a Scrum-based team of AI agents.

---

## Architecture Overview

MerlinsA-IDE is a pnpm monorepo containing 9 packages. Each package is written in strict TypeScript (ESM only) and persists data to SQLite via Drizzle ORM.

### Packages

| Package | Description |
|---|---|
| `@the-ide/core` | Orchestrator, agent manager, goal tracker, session manager, and event bus |
| `@the-ide/scrum` | Sprint state machine, backlog manager, velocity tracker, and ceremony runner |
| `@the-ide/db` | Drizzle ORM schema and database connection (SQLite) |
| `@the-ide/rag` | Codebase indexer, chunker, embedder, retriever, and context builder for agents |
| `@the-ide/token-optimizer` | Token budget tracking, model router, and usage reporter |
| `@the-ide/api-registry` | MCP server for API contract registration, drift detection, and sync checking |
| `@the-ide/naming` | MCP server for AST-based naming convention analysis and ESLint rule generation |
| `@the-ide/wizard` | 8-step project start wizard with WBS generation and risk assessment |
| `@the-ide/cli` | Command-line interface for sprint, agent, API, and report management |

---

## Agent Team

Seven AI agents operate as a Scrum team. The Scrum Master is the orchestrator; all others are spawned as sub-agents.

| Agent | Model | Responsibility |
|---|---|---|
| Product Owner | sonnet | Backlog prioritization, acceptance criteria definition |
| Scrum Master | sonnet | Orchestration, ceremonies, impediment resolution |
| Architect | sonnet | System design, pattern enforcement, design documents |
| Developer | sonnet | Feature implementation, unit tests, JSDoc |
| QA Engineer | haiku | Test execution, validation, acceptance criteria verification |
| DevOps Engineer | haiku | Build pipelines, deployment, CI/CD configuration |
| API Guardian | haiku | API contract monitoring, drift detection, breaking change alerts |

Agent definitions are stored in `.claude/agents/*.md` as YAML-frontmatter markdown files.

---

## Key Features

- **Scrum-based sprint management** — full state machine (PLANNING → IN_PROGRESS → REVIEW → RETROSPECTIVE → COMPLETED) with velocity tracking and burndown data
- **Goal drift detection** — agents are scored for drift at each tool use; sessions with a score of 3 or above trigger warnings
- **Token budget optimization** — per-sprint token budgets with model routing (haiku for lightweight tasks, sonnet for complex reasoning)
- **API contract tracking** — every endpoint is registered via the `api-registry` MCP server; drift and breaking changes are flagged before merge
- **Naming convention enforcement** — AST analysis via the `naming` MCP server catches camelCase, PascalCase, UPPER_CASE, and boolean-prefix violations
- **RAG-powered codebase context** — the `rag` package indexes the codebase into chunks, embeds them, and retrieves relevant context for each agent session
- **Project start wizard** — 8-step flow covers vision, scope, tech stack, architecture, WBS generation, sprint planning, risk assessment, and database scaffolding

---

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

The CLI is available after building:

```bash
node packages/cli/dist/index.js --help
```

---

## CLI Commands

| Command | Description |
|---|---|
| `the-ide sprint start <project-id>` | Create and start a new sprint |
| `the-ide sprint status <sprint-id>` | Show current sprint progress and token usage |
| `the-ide sprint review <sprint-id>` | Print sprint review summary |
| `the-ide agent list` | List all agent definitions and models |
| `the-ide agent status` | Show active agent sessions with drift scores |
| `the-ide api list <project-id>` | List registered API contracts |
| `the-ide api check <project-id>` | Check for API contract drift |
| `the-ide report tokens <sprint-id>` | Token usage broken down by model |
| `the-ide report agents <sprint-id>` | Agent performance: success rate, cost, drift |

---

## Project Structure

```
packages/
  api-registry/     # MCP server — API contract registry and drift detection
  cli/              # CLI entry point and commands
  core/             # Orchestrator, agent manager, goal tracker
  db/               # Drizzle ORM schema and SQLite connection
  naming/           # MCP server — naming convention AST analyzer
  rag/              # Codebase indexing and context retrieval
  scrum/            # Sprint, backlog, velocity, ceremonies
  token-optimizer/  # Token budget and model routing
  wizard/           # Project start wizard and risk assessor
.claude/
  agents/           # Agent definitions (YAML frontmatter + system prompt)
  commands/         # Slash command definitions for Claude Code
```

---

## Development

### Running Tests

```bash
pnpm test              # Run all tests from root
pnpm --filter @the-ide/scrum test   # Run tests for a single package
```

### Adding a New Agent

1. Create `.claude/agents/<role-name>.md` with YAML frontmatter:
   ```yaml
   ---
   name: role-name
   model: claude-sonnet-4-5
   tools: [Read, Write, Edit, Bash, Grep, Glob]
   ---
   ```
2. Write the system prompt in the markdown body following the existing agent conventions.
3. Add the agent name to the `agentDefinitions` array in `packages/cli/src/commands/agent.ts`.

### Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, and `src/index.ts`.
2. Name the package `@the-ide/<name>` and add it to `pnpm-workspace.yaml` if not already covered by the glob.
3. Extend `tsconfig.base.json` in the package tsconfig.

### Naming Conventions

All code must follow the mandatory conventions defined in `CLAUDE.md`: `camelCase` for variables and functions, `PascalCase` for types and classes, `UPPER_CASE` for module-level constants, and `is`/`has`/`should`/`can`/`will` prefixes for booleans.

---

## License

MIT
