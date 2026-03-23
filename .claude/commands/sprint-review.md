Generate a sprint review report. Uses `CeremonyManager`, `VelocityTracker`, and `DefinitionOfDoneChecker` from `@the-ide/scrum`.

## Step 1: Gather Sprint Data
Call `SprintManager.getActiveSprint(projectId)` to find the current sprint.
Call `SprintManager.getSprintProgress(sprintId)` to get completion metrics:
- Total tasks, done, in-progress, blocked
- Percent complete

## Step 2: Definition of Done Check
For each completed task, call `DefinitionOfDoneChecker.checkTask(taskId)` to verify:
- Acceptance criteria met
- Tests pass
- No naming violations
- API contracts consistent
- No type errors
- Code review approved

## Step 3: Sprint Review Report
Call `CeremonyManager.generateSprintReview(sprintId)` which produces:
- Sprint goal status (met / partially met / not met)
- Story completion rate (completed vs planned)
- Token usage vs budget (with cost breakdown by agent and model)
- List of completed stories with summaries
- List of incomplete stories with blockers

## Step 4: Record Velocity
Call `VelocityTracker.recordVelocity(sprintId, completedPoints)` to store the sprint velocity for future capacity prediction.

## Step 5: API Drift Check
Run `SyncChecker.checkSync()` across all modified files to verify:
- All backend routes have registered API contracts
- All frontend API calls match registered contracts
- No breaking changes were introduced without versioning

## Step 6: Retrospective
Call `CeremonyManager.generateRetrospective(sprintId)` which analyzes:
- Completion rate (high/low performance)
- Blocked tasks (impediment patterns)
- Token budget adherence
- Goal drift scores across agents
- Produces: what went well, what did not go well, improvements for next sprint

## Step 7: Complete Sprint
Call `SprintManager.completeSprint(sprintId)` which transitions:
- IN_PROGRESS -> REVIEW -> RETROSPECTIVE -> COMPLETED
- Sets the sprint endDate

Present the full report to the user and suggest actions for the next sprint.
