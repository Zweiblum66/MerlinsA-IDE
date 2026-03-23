Launch the project start wizard to scope and set up a new project. The wizard runs through 8 steps using the `ProjectWizard` class from `@the-ide/wizard`.

## Step 1: Project Vision (`step1Vision`)
Ask the user: What are you building? Who is the target user? What problem does it solve?
Collect a `ProjectVision` with: name, description, targetUsers, problemStatement, successMetrics.

## Step 2: Scope Definition (`step2Scope`)
Based on the vision, suggest features organized as:
- Core features (must-have for MVP)
- Nice-to-have features (post-MVP)
- Out-of-scope items (explicitly excluded)

Let the user refine the list. Store as `ScopeDefinition`.

## Step 3: Tech Stack (`step3TechStack`)
Present options from `TECH_STACK_OPTIONS`: frontend (React, Vue, Svelte, None), backend (Express, Fastify, Hono, None), database (SQLite, PostgreSQL, None), auth (JWT, OAuth, None).
Validate selections. Store as `TechStackChoice`.

## Step 4: Architecture (`step4Architecture`)
Choose from `ARCHITECTURE_TEMPLATES`: monolith, frontend-api, microservices, serverless.
Each template defines directory structure, default dependencies, and config files.

## Step 5: Work Breakdown (`step5WorkBreakdown`)
Call `WbsGenerator.generateFromScope(scope, techStack)` to create:
- A "Project Setup" epic (always included, with conditional database/auth stories)
- One epic per core feature with backend, frontend, and testing stories
- Tasks assigned to agents by keyword matching (infrastructure -> devops, UI -> developer, testing -> qa)

## Step 6: Sprint Planning (`step6SprintPlanning`)
Set sprint duration (default: 2 weeks) and velocity estimate.
Allocate stories to sprints based on story points and velocity.

## Step 7: Risk Assessment (`step7RiskAssessment`)
Call `RiskAssessor.assessRisks(vision, scope, techStack, architecture)` to identify:
- Scope risk (feature count thresholds)
- Complexity risk (microservices, real-time, payments)
- Dependency risk (external auth providers)
- Technical risk (unfamiliar tech, multiple new technologies)

## Step 8: Project Generation (`step8ProjectGeneration`)
Insert into database via `@the-ide/db`:
- Project record with vision and tech stack
- Sprint records with goals
- Epic, user story, and task records from the WBS
- Initialize the codebase index via `ContextProvider.indexProject()`

After completion, the project is ready for `/sprint-start`.
