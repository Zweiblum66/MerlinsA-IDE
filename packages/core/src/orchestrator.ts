import { eq } from "drizzle-orm";
import {
  agentSessions,
  sprints,
  tasks,
  userStories,
} from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import type {
  EventBus,
  EventHandler,
  OrchestratorEvent,
} from "./types/events.js";
import type { AgentRole } from "./types/agent.js";
import type { GoalContext, TaskAssignment } from "./types/task.js";
import { DEFAULT_AGENT_CONFIGS } from "./types/agent.js";
import { AgentManager } from "./agent-manager.js";
import { GoalTracker } from "./goal-tracker.js";
import { SessionManager } from "./session-manager.js";
import { AgentRunner } from "./agent-runner.js";

const TOKEN_BUDGET_WARNING_THRESHOLD = 0.8;

export class Orchestrator {
  private readonly db: TheIdeDatabase;
  private readonly projectId: string;
  private readonly projectRoot: string;
  private readonly eventBus: EventBus;
  private readonly agentManager: AgentManager;
  private readonly goalTracker: GoalTracker;
  private readonly sessionManager: SessionManager;

  constructor(db: TheIdeDatabase, projectId: string, projectRoot?: string) {
    this.db = db;
    this.projectId = projectId;
    this.projectRoot = projectRoot ?? process.cwd();
    this.eventBus = Orchestrator.createEventBus();
    this.agentManager = new AgentManager(db, this.eventBus);
    this.goalTracker = new GoalTracker(this.eventBus);
    this.sessionManager = new SessionManager();

    this.registerDefaultHandlers();
  }

  static createEventBus(): EventBus {
    const handlers = new Map<string, Set<EventHandler>>();

    return {
      async emit(event: OrchestratorEvent): Promise<void> {
        const typeHandlers = handlers.get(event.type);
        if (!typeHandlers) return;

        const promises: Array<void | Promise<void>> = [];
        for (const handler of typeHandlers) {
          promises.push(handler(event));
        }
        await Promise.all(promises);
      },
      on(type: string, handler: EventHandler): void {
        let typeHandlers = handlers.get(type);
        if (!typeHandlers) {
          typeHandlers = new Set();
          handlers.set(type, typeHandlers);
        }
        typeHandlers.add(handler);
      },
      off(type: string, handler: EventHandler): void {
        const typeHandlers = handlers.get(type);
        if (typeHandlers) {
          typeHandlers.delete(handler);
        }
      },
    };
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  getAgentManager(): AgentManager {
    return this.agentManager;
  }

  getGoalTracker(): GoalTracker {
    return this.goalTracker;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  async runSprint(sprintId: string): Promise<void> {
    // Emit sprint start
    await this.eventBus.emit({ type: "SPRINT_STARTED", sprintId });

    // Get all stories assigned to this sprint
    const stories = await this.db
      .select()
      .from(userStories)
      .where(eq(userStories.sprintId, sprintId));

    // Get all tasks for those stories
    const sprintTasks: Array<typeof tasks.$inferSelect> = [];
    for (const story of stories) {
      const storyTasks = await this.db
        .select()
        .from(tasks)
        .where(eq(tasks.userStoryId, story.id));
      sprintTasks.push(...storyTasks);
    }

    // Assign TODO tasks to their designated agents
    const todoTasks = sprintTasks.filter((t) => t.status === "TODO");
    for (const task of todoTasks) {
      if (task.assignedAgent) {
        await this.assignTask(task, task.assignedAgent as AgentRole);
      }
    }

    // Monitor progress
    await this.monitorProgress(sprintId);

    // Check if all tasks are done
    const allDone = sprintTasks.every(
      (t) => t.status === "DONE" || t.status === "BLOCKED",
    );
    if (allDone) {
      await this.eventBus.emit({ type: "SPRINT_COMPLETED", sprintId });
    }
  }

  async assignTask(
    task: typeof tasks.$inferSelect,
    agentRole: AgentRole,
  ): Promise<void> {
    const config = DEFAULT_AGENT_CONFIGS[agentRole];
    if (!config) {
      throw new Error(`Unknown agent role: ${agentRole}`);
    }

    const goalContext: GoalContext = task.goalContext
      ? (JSON.parse(task.goalContext) as GoalContext)
      : {
          description: task.description,
          acceptanceCriteria: [],
          scopeFiles: JSON.parse(task.scopeFiles) as string[],
          scopeKeywords: [],
        };

    const assignment: TaskAssignment = {
      taskId: task.id,
      agentRole,
      goalContext,
      prompt: this.agentManager.buildAgentPrompt({
        taskId: task.id,
        agentRole,
        goalContext,
        prompt: task.description,
      }),
    };

    // Set goal context for drift tracking
    this.goalTracker.setGoalContext(task.id, goalContext, agentRole);

    // Update task status
    await this.db
      .update(tasks)
      .set({ status: "IN_PROGRESS", assignedAgent: agentRole })
      .where(eq(tasks.id, task.id));

    // Create runner and register MCP tools
    const runner = new AgentRunner({
      projectRoot: this.projectRoot,
      db: this.db,
      eventBus: this.eventBus,
    });

    // Run the agent and handle the result
    const result = await runner.run(assignment);

    // Update task status based on result.
    // The DB task schema supports: TODO | IN_PROGRESS | BLOCKED | REVIEW | DONE.
    // A "failed" runner outcome is mapped to BLOCKED so the scrum master can review.
    const newStatus =
      result.status === "completed"
        ? "DONE"
        : "BLOCKED";

    await this.db
      .update(tasks)
      .set({ status: newStatus })
      .where(eq(tasks.id, task.id));
  }

  async monitorProgress(sprintId: string): Promise<void> {
    const activeAgents = await this.agentManager.getActiveAgents();

    // Check token budget
    const sprintResults = await this.db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    if (sprintResults.length > 0) {
      const sprint = sprintResults[0];
      const percentUsed = sprint.tokensUsed / sprint.tokenBudget;

      if (percentUsed >= 1) {
        await this.eventBus.emit({
          type: "TOKEN_BUDGET_EXCEEDED",
          sprintId,
        });
      } else if (percentUsed >= TOKEN_BUDGET_WARNING_THRESHOLD) {
        await this.eventBus.emit({
          type: "TOKEN_BUDGET_WARNING",
          sprintId,
          percentUsed: Math.round(percentUsed * 100),
        });
      }
    }

    // Check drift scores for active agents
    for (const agent of activeAgents) {
      if (agent.taskId) {
        const driftScore = this.goalTracker.getDriftScore(agent.taskId);
        if (driftScore > 0 && agent.sessionId) {
          // Update drift score in session
          await this.db
            .update(agentSessions)
            .set({ driftScore })
            .where(eq(agentSessions.id, agent.sessionId));
        }
      }
    }
  }

  async handleEvent(event: OrchestratorEvent): Promise<void> {
    switch (event.type) {
      case "GOAL_DRIFT_DETECTED": {
        // Pause the drifting agent so the scrum master can review
        const activeAgents = await this.agentManager.getActiveAgents();
        const driftingAgent = activeAgents.find(
          (a) => a.taskId === event.taskId,
        );
        if (driftingAgent?.sessionId) {
          await this.agentManager.pauseAgent(driftingAgent.sessionId);
        }
        break;
      }
      case "GOAL_DRIFT_RESOLVED": {
        // Resume the agent after scrum master review
        const agents = await this.agentManager.getActiveAgents();
        const resolvedAgent = agents.find(
          (a) => a.taskId === event.taskId,
        );
        if (resolvedAgent?.sessionId) {
          this.goalTracker.resetDriftScore(event.taskId);
          await this.agentManager.resumeAgent(resolvedAgent.sessionId);
        }
        break;
      }
      case "TOKEN_BUDGET_EXCEEDED": {
        // Pause all active agents for this sprint
        const allActive = await this.agentManager.getActiveAgents();
        for (const agent of allActive) {
          if (agent.sessionId) {
            await this.agentManager.pauseAgent(agent.sessionId);
          }
        }
        break;
      }
      case "TASK_COMPLETED": {
        // Clean up goal tracking
        this.goalTracker.removeGoal(event.taskId);
        break;
      }
      case "TASK_FAILED": {
        // Clean up goal tracking
        this.goalTracker.removeGoal(event.taskId);
        break;
      }
      default:
        // Other events are logged but require no automatic action
        break;
    }
  }

  private registerDefaultHandlers(): void {
    // Route all events through the central handler
    const allEventTypes = [
      "SPRINT_STARTED",
      "TASK_ASSIGNED",
      "TASK_COMPLETED",
      "TASK_FAILED",
      "TASK_BLOCKED",
      "GOAL_DRIFT_DETECTED",
      "GOAL_DRIFT_RESOLVED",
      "TOKEN_BUDGET_WARNING",
      "TOKEN_BUDGET_EXCEEDED",
      "SPRINT_COMPLETED",
      "API_DRIFT_DETECTED",
      "NAMING_VIOLATION",
    ];

    for (const eventType of allEventTypes) {
      this.eventBus.on(eventType, (event) => this.handleEvent(event));
    }
  }
}
