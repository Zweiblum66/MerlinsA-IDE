# the IDE — Project Conventions

## Overview
This is an AI-powered IDE orchestration layer built on the Claude Code Agent SDK. It organizes development through a Scrum-based team of AI agents.

## Architecture
- **Monorepo** with pnpm workspaces under `packages/`
- **TypeScript** in strict mode, ESM only
- **SQLite** via Drizzle ORM for all persistent data
- **MCP servers** for API registry and naming enforcement

## Naming Conventions (MANDATORY)
- `camelCase`: variables, functions, parameters, object properties
- `PascalCase`: classes, interfaces, type aliases, enums
- `UPPER_CASE`: constants (module-level), enum members
- Boolean variables MUST use prefix: `is`, `has`, `should`, `can`, `will`
- Private class members: leading underscore `_privateMethod`
- File names: `kebab-case.ts`
- Package names: `@the-ide/package-name`

## Code Style
- ESM imports with `.js` extensions (required for Node.js ESM)
- Use `type` imports for type-only imports: `import type { Foo } from "./foo.js"`
- Prefer `interface` over `type` for object shapes
- No `any` — use `unknown` and narrow
- All functions must have explicit return types

## API Contract Tracking
- Every API endpoint MUST be registered in the API contract registry
- Frontend API calls MUST match registered contracts
- Breaking changes MUST be flagged before merge
- Use the `api_register_endpoint` MCP tool when creating new endpoints
- Use `api_check_drift` before completing any task that touches API files

## Database
- All tables defined in `packages/db/src/schema.ts`
- Use Drizzle ORM query builder, not raw SQL
- Use `uuid` v4 for all primary keys
- Timestamps stored as Unix integers

## Testing
- Vitest for all tests
- Test files: `*.test.ts` alongside source files
- Run: `pnpm test` from root or individual package

## Build
- tsup for bundling each package
- Build: `pnpm build` from root
- Dev: `pnpm dev` for watch mode

## Agent Definitions
- Stored in `.claude/agents/*.md`
- YAML frontmatter defines name, tools, model
- Markdown body is the system prompt
- ScrumMaster is the orchestrator agent
