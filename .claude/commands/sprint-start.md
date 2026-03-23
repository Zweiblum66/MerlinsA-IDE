Start a new sprint for the project. Uses `SprintManager`, `BacklogManager`, and `AgentRunner` from `@the-ide/scrum` and `@the-ide/core`.

## Step 1: Review Backlog
Call `BacklogManager.getBacklog(projectId)` to retrieve the full epic/story/task hierarchy.
Show the user prioritized stories that are not yet assigned to a sprint.

## Step 2: Select Stories
Based on `VelocityTracker.predictSprintCapacity()` (3-sprint lookback average), suggest stories that fit the predicted capacity. Let the user confirm or adjust the selection.

## Step 3: Create Sprint
Call `SprintManager.createSprint(projectId, sprintNumber, goal)` with:
- Sprint number (auto-incremented)
- Sprint goal (derived from selected stories)
- Token budget allocation via `TokenBudgetManager.allocateBudget()`

## Step 4: Assign Stories
For each selected story, call `BacklogManager.assignTaskToSprint(taskId, sprintId)` to link tasks to the sprint.

## Step 5: Start Sprint
Call `SprintManager.startSprint(sprintId)` which:
- Runs the state machine transition PLANNING -> IN_PROGRESS
- Guard validates at least one task exists
- Sets the sprint startDate

## Step 6: Spawn Agents
For each task in the sprint, the `Orchestrator` will:
1. Build a `TaskAssignment` with goal context, scope files, and acceptance criteria
2. Fetch relevant codebase context via `ContextProvider.getContextForTask()`
3. Create an `AgentRunner` for the assigned role (developer, qa-engineer, devops-engineer, etc.)
4. Register MCP tools (api-registry, naming) via `ToolRegistry`
5. Call `runner.run(taskAssignment)` to execute the task
6. Record token usage and update task status

## Step 7: Monitor
Show sprint dashboard with:
- Agent status (active, paused, completed, failed)
- Goal drift scores per agent
- Token budget consumption
- Task completion progress
