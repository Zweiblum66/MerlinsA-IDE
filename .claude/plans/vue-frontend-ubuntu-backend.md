# Plan: Vue.js Frontend + Ubuntu Backend — Complete Implementation

## Current State

Both `@the-ide/web` (Vue 3) and `@the-ide/api` (Fastify) packages already exist with scaffolding:

**Frontend (packages/web) — PARTIAL:**
- ✅ Vite + Vue 3 + Tailwind CSS 4 + Pinia + Vue Router configured
- ✅ 10 routes defined with auth guard
- ✅ 6 Pinia stores with full TypeScript interfaces and API calls
- ✅ `useApi()` composable with JWT auth + `useSse()` for real-time events
- ❌ **All 11 Vue components missing** (App.vue + 10 views)

**Backend (packages/api) — PARTIAL:**
- ✅ Fastify 5 + CORS + JWT + Swagger + SSE plugins scaffolded
- ✅ Config loader, event bus service, common schemas
- ✅ Health + Projects routes with OpenAPI schemas
- ❌ **No server bootstrap** (index.ts missing)
- ❌ **6 route modules missing** (sprints, agents, tokens, contracts, naming, auth)

## Implementation Steps

### Phase 1: Backend — Server Bootstrap + Missing Routes (5 files)

**1.1 `packages/api/src/index.ts`** — Server bootstrap
- Create Fastify instance, register all plugins (CORS, auth, DB, SSE, Swagger)
- Register all routes under `/api/v1` prefix
- Listen on `0.0.0.0:3000`
- Graceful shutdown handler

**1.2 `packages/api/src/routes/auth.ts`** — Authentication
- `POST /api/v1/auth/login` — issue JWT token (simplified: project-based auth)
- `GET /api/v1/auth/me` — return current user from JWT

**1.3 `packages/api/src/routes/sprints.ts`** — Sprint management
- `GET /api/v1/projects/:projectId/sprints` — list sprints
- `POST /api/v1/sprints` — create sprint
- `PATCH /api/v1/sprints/:id/start` — start sprint (state machine transition)
- `GET /api/v1/sprints/:id/progress` — task progress breakdown
- `GET /api/v1/sprints/:id/burndown` — burndown chart data

**1.4 `packages/api/src/routes/agents.ts`** — Agent monitoring
- `GET /api/v1/agents/sessions` — list agent sessions (filterable by sprint)
- `GET /api/v1/agents/definitions` — return agent role configs
- `GET /api/v1/agents/activity` — recent agent activity feed

**1.5 `packages/api/src/routes/tokens.ts`** — Token analytics
- `GET /api/v1/tokens/by-model` — usage grouped by model
- `GET /api/v1/tokens/by-agent` — usage grouped by agent
- `GET /api/v1/tokens/timeline` — daily usage timeline
- `GET /api/v1/tokens/budget` — current budget status

**1.6 `packages/api/src/routes/contracts.ts`** — API contract browser
- `GET /api/v1/contracts` — list all contracts
- `GET /api/v1/contracts/:id/changes` — change history for a contract

**1.7 `packages/api/src/routes/naming.ts`** — Naming violations
- `GET /api/v1/naming/violations` — list violations (filterable by file)
- `GET /api/v1/naming/summary` — aggregate violation stats

**1.8 `packages/api/src/routes/events.ts`** — SSE endpoint
- `GET /api/v1/events?token=...` — Server-Sent Events stream with JWT auth

### Phase 2: Frontend — App Shell + All 10 Views (11 Vue files)

**2.1 `App.vue`** — Root layout
- Sidebar navigation with route links and active state
- Top bar with project selector and SSE connection indicator
- Router-view content area
- Real-time event listener via `useSse()` that updates stores

**2.2 `LoginView.vue`** — Login page
- Simple project selection + JWT login form
- Stores token in localStorage

**2.3 `DashboardView.vue`** — Main dashboard (home page)
- Sprint status card with progress bar
- Token budget gauge
- Active agents list with drift indicators
- Guardrails summary (API contracts + naming)
- Quick action buttons

**2.4 `SprintBoardView.vue`** — Kanban board
- 4-column board: Todo → In Progress → Review → Done
- Task cards with agent assignment, story points
- Drag-and-drop status changes (emits API calls)

**2.5 `AgentMonitorView.vue`** — Agent monitoring
- Agent session table with status, model, cost, drift
- Real-time activity feed (SSE updates)
- Agent role definitions panel

**2.6 `BurndownView.vue`** — Sprint burndown chart
- Chart.js line chart: ideal vs actual
- Sprint selector
- Velocity comparison across sprints

**2.7 `TokenAnalyticsView.vue`** — Token usage analytics
- Doughnut chart: usage by model
- Bar chart: usage by agent
- Timeline chart: daily spend
- Budget remaining gauge

**2.8 `ContractBrowserView.vue`** — API contract viewer
- Contract list with method badges (GET/POST/PUT/DELETE)
- Schema viewer for request/response
- Change history with breaking change highlights

**2.9 `NamingReportView.vue`** — Naming convention report
- Summary stats cards
- File tree with violation counts
- Violation detail list with suggested fixes

**2.10 `WizardView.vue`** — Project start wizard
- Multi-step form (vision → scope → tech stack → architecture → WBS → sprint plan → risk → generate)
- Step indicator with progress
- Preview panels for each step

**2.11 `AuditView.vue`** — Health audit dashboard
- Health score gauge (0-100)
- Check results with pass/warn/fail indicators
- Historical health trend

### Phase 3: Ubuntu Deployment Config (3 files)

**3.1 `Dockerfile`** — Multi-stage Docker build
- Stage 1: Build all packages (pnpm install + build)
- Stage 2: Build Vue frontend (vite build)
- Stage 3: Production image (Ubuntu latest base, Node 22, SQLite)
- Fastify serves built Vue SPA via `@fastify/static`
- Single container: API + static frontend

**3.2 `docker-compose.yml`** — Orchestration
- Single service: `merlins-ide`
- Volume mount for SQLite persistence
- Environment variables for config
- Port mapping 3000:3000

**3.3 `.env.production`** — Production environment template
- `NODE_ENV=production`
- `PORT=3000`
- `HOST=0.0.0.0`
- `DB_PATH=/data/the-ide.db`
- `JWT_SECRET=<generate-random>`
- `CORS_ORIGINS=*`

### Phase 4: Build & Verify

- Build all packages: `pnpm build`
- Run tests: `pnpm test`
- Verify API contracts match between frontend stores and backend routes
- Verify all naming conventions are followed

## Execution Strategy

- **Phase 1** (backend): Launch 2 parallel agents — one for bootstrap+auth+events, one for remaining 5 route modules
- **Phase 2** (frontend): Launch 3 parallel agents — one for App.vue+Login+Dashboard, one for Board+Agents+Burndown+Tokens, one for Contracts+Naming+Wizard+Audit
- **Phase 3** (deploy): Single agent for Docker + compose + env
- **Phase 4** (verify): Build, test, contract check

## API Contract Verification

Every route created in Phase 1 will be cross-checked against the existing Pinia store API calls to ensure:
- Same HTTP method and path
- Compatible request/response shapes
- All store endpoints are served
- No orphan endpoints
