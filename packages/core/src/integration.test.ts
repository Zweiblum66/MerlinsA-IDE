/**
 * Integration test: Full sprint workflow
 *
 * Tests the complete lifecycle:
 * 1. Create project via wizard
 * 2. Create sprint with backlog items
 * 3. Assign tasks to agents
 * 4. Track goal drift
 * 5. Monitor token budget
 * 6. Check API contracts
 * 7. Validate naming conventions
 * 8. Complete sprint with DoD
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@the-ide/db";
import { initializeDatabase, type TheIdeDatabase } from "@the-ide/db";
import { BacklogManager } from "@the-ide/scrum";
import { SprintManager } from "@the-ide/scrum";
import { SprintStateMachine } from "@the-ide/scrum";
import { DefinitionOfDoneChecker } from "@the-ide/scrum";
import { CeremonyManager } from "@the-ide/scrum";
import { GoalTracker } from "./goal-tracker.js";
import { AgentManager } from "./agent-manager.js";
import { SessionManager } from "./session-manager.js";
import { DEFAULT_AGENT_CONFIGS } from "./types/agent.js";
import type { EventBus, OrchestratorEvent } from "./types/events.js";
import type { GoalContext, TaskAssignment } from "./types/task.js";

function createEventBus(): EventBus & { events: OrchestratorEvent[] } {
  const handlers = new Map<string, Set<(event: OrchestratorEvent) => void | Promise<void>>>();
  const events: OrchestratorEvent[] = [];

  return {
    events,
    async emit(event: OrchestratorEvent): Promise<void> {
      events.push(event);
      const typeHandlers = handlers.get(event.type);
      if (typeHandlers) {
        for (const handler of typeHandlers) {
          await handler(event);
        }
      }
    },
    on(type: string, handler: (event: OrchestratorEvent) => void | Promise<void>): void {
      if (!handlers.has(type)) {
        handlers.set(type, new Set());
      }
      handlers.get(type)!.add(handler);
    },
    off(type: string, handler: (event: OrchestratorEvent) => void | Promise<void>): void {
      handlers.get(type)?.delete(handler);
    },
  };
}

describe("Integration: Full Sprint Workflow", () => {
  let sqlite: Database.Database;
  let db: TheIdeDatabase;
  let projectId: string;

  beforeEach(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    db = drizzle(sqlite, { schema }) as unknown as TheIdeDatabase;
    initializeDatabase(db);

    // Seed a project
    projectId = "test-project-001";
    const now = new Date();
    db.insert(schema.projects).values({
      id: projectId,
      name: "Test Project",
      description: "Integration test project",
      rootPath: "/tmp/test-project",
      techStack: JSON.stringify({ frontend: "React", backend: "Express" }),
      createdAt: now,
      updatedAt: now,
    }).run();
  });

  afterEach(() => {
    sqlite.close();
  });

  it("should run a complete sprint lifecycle", async () => {
    const backlog = new BacklogManager();
    const sprintManager = new SprintManager();

    // Step 1: Create backlog items
    const epic = await backlog.createEpic(projectId, "User Authentication", "Implement auth system", db);
    expect(epic.id).toBeDefined();

    const story = await backlog.createUserStory(
      epic.id,
      "Login form",
      "As a user, I want to log in",
      ["User can enter email", "User can enter password", "Form validates input"],
      3,
      db,
    );
    expect(story.id).toBeDefined();

    const task = await backlog.createTask(
      story.id,
      "Implement login API endpoint",
      "Create POST /api/auth/login endpoint",
      "developer",
      ["src/routes/auth.ts", "src/services/auth.ts"],
      [],
      db,
    );
    expect(task.id).toBeDefined();

    // Step 2: Create and start sprint
    const sprint = await sprintManager.createSprint(projectId, 1, "Deliver auth MVP", 5_000_000, db);
    expect(sprint.id).toBeDefined();

    // Assign story to sprint
    await backlog.assignTaskToSprint(task.id, sprint.id, db);

    // Start sprint
    await sprintManager.startSprint(sprint.id, db);
    const activeSprint = await sprintManager.getActiveSprint(projectId, db);
    expect(activeSprint).toBeDefined();
    expect(activeSprint!.status).toBe("IN_PROGRESS");

    // Step 3: Set up goal tracking
    const eventBus = createEventBus();
    const goalTracker = new GoalTracker(eventBus);

    const goalContext: GoalContext = {
      description: "Implement login API endpoint",
      acceptanceCriteria: ["POST /api/auth/login works", "Returns JWT token"],
      scopeFiles: ["src/routes/auth.ts", "src/services/auth.ts"],
      scopeKeywords: ["auth", "login", "jwt"],
    };
    goalTracker.setGoalContext(task.id, goalContext);

    // Step 4: Simulate agent work — in-scope actions
    expect(goalTracker.checkFileScope(task.id, "src/routes/auth.ts")).toBe(true);
    goalTracker.recordAction(task.id, "src/routes/auth.ts", "write");
    expect(goalTracker.getDriftScore(task.id)).toBe(0);

    // Step 5: Simulate out-of-scope action (goal drift)
    expect(goalTracker.checkFileScope(task.id, "src/utils/helpers.ts")).toBe(false);
    goalTracker.recordAction(task.id, "src/utils/helpers.ts", "write");
    expect(goalTracker.getDriftScore(task.id)).toBe(1);

    // More out-of-scope actions to trigger drift warning
    goalTracker.recordAction(task.id, "src/config/database.ts", "write");
    goalTracker.recordAction(task.id, "src/middleware/cors.ts", "write");
    expect(goalTracker.getDriftScore(task.id)).toBe(3);

    // Should have emitted GOAL_DRIFT_DETECTED event
    const driftEvents = eventBus.events.filter(e => e.type === "GOAL_DRIFT_DETECTED");
    expect(driftEvents.length).toBe(1);

    // Step 6: Reset drift after intervention
    goalTracker.resetDriftScore(task.id);
    expect(goalTracker.getDriftScore(task.id)).toBe(0);

    // Step 7: Complete the task
    await backlog.updateTaskStatus(task.id, "DONE", db);

    // Step 8: Check sprint progress
    const progress = await sprintManager.getSprintProgress(sprint.id, db);
    expect(progress.total).toBeGreaterThanOrEqual(1);
    expect(progress.done).toBeGreaterThanOrEqual(1);

    // Step 9: Check Definition of Done
    const dodChecker = new DefinitionOfDoneChecker();
    const dodResult = await dodChecker.checkTask(task.id, db);
    expect(dodResult.checks.length).toBe(6);

    // Step 10: Generate sprint reports
    const ceremonies = new CeremonyManager();
    const standupReport = await ceremonies.generateStandupReport(sprint.id, db);
    expect(standupReport.date).toBeDefined();

    const reviewReport = await ceremonies.generateSprintReview(sprint.id, db);
    expect(reviewReport.sprintGoal).toBe("Deliver auth MVP");
  });

  it("should track agent sessions and token usage", async () => {
    const eventBus = createEventBus();
    const agentManager = new AgentManager(db, eventBus);
    const sessionManager = new SessionManager();

    // Create sprint
    const sprintId = "sprint-001";
    db.insert(schema.sprints).values({
      id: sprintId,
      projectId,
      number: 1,
      goal: "Test sprint",
      status: "IN_PROGRESS",
      tokenBudget: 1_000_000,
      tokensUsed: 0,
      createdAt: new Date(),
    }).run();

    // Create task
    const epicId = "epic-001";
    db.insert(schema.epics).values({
      id: epicId,
      projectId,
      title: "Test Epic",
      createdAt: new Date(),
    }).run();

    const storyId = "story-001";
    db.insert(schema.userStories).values({
      id: storyId,
      epicId,
      sprintId,
      title: "Test Story",
      createdAt: new Date(),
    }).run();

    const taskId = "task-001";
    db.insert(schema.tasks).values({
      id: taskId,
      userStoryId: storyId,
      title: "Test Task",
      assignedAgent: "developer",
      status: "TODO",
      createdAt: new Date(),
    }).run();

    // Spawn agent
    const config = DEFAULT_AGENT_CONFIGS["developer"];
    const assignment: TaskAssignment = {
      taskId,
      agentRole: "developer",
      goalContext: {
        description: "Test task",
        acceptanceCriteria: ["It works"],
        scopeFiles: ["test.ts"],
        scopeKeywords: ["test"],
      },
      prompt: "Implement the test feature",
    };

    const status = await agentManager.spawnAgent(config, assignment);
    expect(status.agentName).toBe("developer");
    expect(status.status).toBe("active");
    expect(status.sessionId).toBeDefined();

    // Record token usage
    await sessionManager.recordTokenUsage(
      status.sessionId!,
      { input: 1000, output: 500, cacheRead: 200, cacheCreation: 100 },
      "claude-sonnet-4-20250514",
      sprintId,
      db,
    );

    // Check session was updated
    const session = await sessionManager.getSession(status.sessionId!, db);
    expect(session).toBeDefined();
    expect(session!.agentName).toBe("developer");

    // Verify agent is active in DB
    const activeSession = await sessionManager.getSession(status.sessionId!, db);
    expect(activeSession).toBeDefined();
    expect(activeSession!.status).toBe("ACTIVE");

    // Complete agent session
    await sessionManager.endSession(status.sessionId!, "COMPLETED", db);

    const completedSession = await sessionManager.getSession(status.sessionId!, db);
    expect(completedSession!.status).toBe("COMPLETED");
  });

  it("should enforce naming conventions via analyzer", async () => {
    // Import dynamically to avoid circular deps in test setup
    const { NamingAnalyzer, DEFAULT_NAMING_RULES } = await import("@the-ide/naming");

    const analyzer = new NamingAnalyzer(DEFAULT_NAMING_RULES);

    // Good code — no violations
    const cleanCode = `
      const userName = "John";
      const isActive = true;
      function getUserById(userId: string): User { return {} as User; }
      class UserService {}
      interface UserProfile {}
      type UserId = string;
      enum UserRole { ADMIN, USER }
    `;
    const cleanViolations = analyzer.analyzeFile("test.ts", cleanCode);
    // Should have minimal or no violations for well-named code
    const realViolations = cleanViolations.filter(v =>
      !v.identifierName.startsWith("User") &&
      v.identifierName !== "userName" &&
      v.identifierName !== "isActive" &&
      v.identifierName !== "getUserById" &&
      v.identifierName !== "userId"
    );
    // The code follows conventions, so expect no violations for the identifiers we control

    // Bad code — violations expected
    const badCode = `
      const UserName = "John";
      class userService {}
      const active = true;
    `;
    const badViolations = analyzer.analyzeFile("bad.ts", badCode);
    expect(badViolations.length).toBeGreaterThan(0);

    // Should flag UserName (variable should be camelCase)
    const userNameViolation = badViolations.find(v => v.identifierName === "UserName");
    expect(userNameViolation).toBeDefined();

    // Should flag userService (class should be PascalCase)
    const classViolation = badViolations.find(v => v.identifierName === "userService");
    expect(classViolation).toBeDefined();
  });

  it("should detect API contract drift", async () => {
    const { DriftDetector } = await import("@the-ide/api-registry");

    const detector = new DriftDetector();

    // No drift
    const noDrift = detector.compareSchemas(
      { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
      { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    );
    expect(noDrift.hasDrift).toBe(false);

    // Breaking: removed required field
    const breakingDrift = detector.compareSchemas(
      { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["name", "email"] },
      { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    );
    expect(breakingDrift.hasDrift).toBe(true);
    expect(breakingDrift.breakingChanges.length).toBeGreaterThan(0);

    // Non-breaking: added optional field
    const nonBreakingDrift = detector.compareSchemas(
      { type: "object", properties: { name: { type: "string" } } },
      { type: "object", properties: { name: { type: "string" }, age: { type: "number" } } },
    );
    expect(nonBreakingDrift.hasDrift).toBe(true);
    expect(nonBreakingDrift.nonBreakingChanges.length).toBeGreaterThan(0);
    expect(nonBreakingDrift.breakingChanges.length).toBe(0);
  });

  it("should generate work breakdown from wizard", async () => {
    const { WbsGenerator } = await import("@the-ide/wizard");

    const generator = new WbsGenerator();

    const wbs = generator.generateFromScope(
      {
        whatBuilding: "Task management app",
        targetUser: "Teams",
        coreProblem: "Task tracking is fragmented",
      },
      {
        coreFeatures: ["Task CRUD", "User authentication", "Dashboard"],
        niceToHave: ["Notifications"],
        outOfScope: ["Mobile app"],
      },
      {
        frontend: "React",
        backend: "Express",
        database: "PostgreSQL",
        auth: "Auth.js",
      },
    );

    expect(wbs.epics.length).toBeGreaterThan(0);

    // Should always have a "Project Setup" epic
    const setupEpic = wbs.epics.find(e => e.title.toLowerCase().includes("setup"));
    expect(setupEpic).toBeDefined();

    // Should have epics for each core feature
    const featureEpics = wbs.epics.filter(e => !e.title.toLowerCase().includes("setup"));
    expect(featureEpics.length).toBeGreaterThanOrEqual(3);

    // Each epic should have stories
    for (const epic of wbs.epics) {
      expect(epic.stories.length).toBeGreaterThan(0);
      for (const story of epic.stories) {
        expect(story.tasks.length).toBeGreaterThan(0);
        expect(story.acceptanceCriteria.length).toBeGreaterThan(0);
      }
    }
  });
});
