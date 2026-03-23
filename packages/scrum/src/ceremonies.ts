import { eq } from "drizzle-orm";
import { sprints, userStories, tasks, agentSessions } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export interface StandupReport {
  date: Date;
  tasksCompleted: Array<{ id: string; title: string; assignedAgent: string | null }>;
  tasksInProgress: Array<{ id: string; title: string; assignedAgent: string | null }>;
  blockers: Array<{ id: string; title: string; assignedAgent: string | null }>;
  driftWarnings: Array<{ agentName: string; driftScore: number }>;
}

export interface SprintReview {
  sprintGoal: string;
  goalMet: boolean;
  storiesCompleted: Array<{ id: string; title: string; storyPoints: number }>;
  storiesIncomplete: Array<{ id: string; title: string; storyPoints: number }>;
  tokenUsage: { budget: number; used: number; percentUsed: number };
}

export interface Retrospective {
  whatWentWell: string[];
  whatDidntGoWell: string[];
  improvements: string[];
}

async function getSprintTasksWithDetails(
  sprintId: string,
  db: TheIdeDatabase,
) {
  const stories = await db
    .select()
    .from(userStories)
    .where(eq(userStories.sprintId, sprintId));

  const allTasks: Array<{
    id: string;
    title: string;
    status: string;
    assignedAgent: string | null;
    userStoryId: string;
    completedAt: Date | null;
  }> = [];

  for (const story of stories) {
    const storyTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        assignedAgent: tasks.assignedAgent,
        userStoryId: tasks.userStoryId,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(eq(tasks.userStoryId, story.id));
    allTasks.push(...storyTasks);
  }

  return { stories, tasks: allTasks };
}

export class CeremonyManager {
  async generateStandupReport(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<StandupReport> {
    const { tasks: allTasks } = await getSprintTasksWithDetails(sprintId, db);

    const tasksCompleted = allTasks
      .filter((t) => t.status === "DONE")
      .map((t) => ({ id: t.id, title: t.title, assignedAgent: t.assignedAgent }));

    const tasksInProgress = allTasks
      .filter((t) => t.status === "IN_PROGRESS")
      .map((t) => ({ id: t.id, title: t.title, assignedAgent: t.assignedAgent }));

    const blockers = allTasks
      .filter((t) => t.status === "BLOCKED")
      .map((t) => ({ id: t.id, title: t.title, assignedAgent: t.assignedAgent }));

    // Check for drift warnings from agent sessions in this sprint
    const sessions = await db
      .select({
        agentName: agentSessions.agentName,
        driftScore: agentSessions.driftScore,
      })
      .from(agentSessions)
      .where(eq(agentSessions.sprintId, sprintId));

    const DRIFT_THRESHOLD = 3;
    const driftWarnings = sessions
      .filter((s) => s.driftScore >= DRIFT_THRESHOLD)
      .map((s) => ({ agentName: s.agentName, driftScore: s.driftScore }));

    return {
      date: new Date(),
      tasksCompleted,
      tasksInProgress,
      blockers,
      driftWarnings,
    };
  }

  async generateSprintReview(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<SprintReview> {
    const sprintResult = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    if (sprintResult.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    const sprint = sprintResult[0];
    const { stories, tasks: allTasks } = await getSprintTasksWithDetails(
      sprintId,
      db,
    );

    const storiesCompleted: SprintReview["storiesCompleted"] = [];
    const storiesIncomplete: SprintReview["storiesIncomplete"] = [];

    for (const story of stories) {
      const storyTasks = allTasks.filter((t) => t.userStoryId === story.id);
      const allDone = storyTasks.length > 0 && storyTasks.every((t) => t.status === "DONE");

      const entry = {
        id: story.id,
        title: story.title,
        storyPoints: story.storyPoints,
      };

      if (allDone) {
        storiesCompleted.push(entry);
      } else {
        storiesIncomplete.push(entry);
      }
    }

    const totalPoints = stories.reduce((sum, s) => sum + s.storyPoints, 0);
    const completedPoints = storiesCompleted.reduce((sum, s) => sum + s.storyPoints, 0);
    const goalMet = totalPoints > 0 && completedPoints >= totalPoints;

    const percentUsed =
      sprint.tokenBudget === 0
        ? 0
        : Math.round((sprint.tokensUsed / sprint.tokenBudget) * 100);

    return {
      sprintGoal: sprint.goal,
      goalMet,
      storiesCompleted,
      storiesIncomplete,
      tokenUsage: {
        budget: sprint.tokenBudget,
        used: sprint.tokensUsed,
        percentUsed,
      },
    };
  }

  async generateRetrospective(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<Retrospective> {
    const sprintResult = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    if (sprintResult.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    const sprint = sprintResult[0];
    const { stories, tasks: allTasks } = await getSprintTasksWithDetails(
      sprintId,
      db,
    );

    const whatWentWell: string[] = [];
    const whatDidntGoWell: string[] = [];
    const improvements: string[] = [];

    // Heuristic: story completion rate
    const totalStories = stories.length;
    const completedStories = stories.filter((story) => {
      const storyTasks = allTasks.filter((t) => t.userStoryId === story.id);
      return storyTasks.length > 0 && storyTasks.every((t) => t.status === "DONE");
    }).length;

    if (totalStories > 0 && completedStories === totalStories) {
      whatWentWell.push("All user stories were completed successfully.");
    } else if (totalStories > 0 && completedStories >= totalStories * 0.75) {
      whatWentWell.push(
        `${completedStories} of ${totalStories} stories completed (${Math.round((completedStories / totalStories) * 100)}%).`,
      );
    } else if (totalStories > 0) {
      whatDidntGoWell.push(
        `Only ${completedStories} of ${totalStories} stories completed (${Math.round((completedStories / totalStories) * 100)}%).`,
      );
      improvements.push("Break stories into smaller, more achievable units.");
    }

    // Heuristic: blocked tasks
    const blockedCount = allTasks.filter((t) => t.status === "BLOCKED").length;
    if (blockedCount > 0) {
      whatDidntGoWell.push(
        `${blockedCount} task(s) remained blocked at sprint end.`,
      );
      improvements.push("Identify and resolve blockers earlier in the sprint.");
    } else if (allTasks.length > 0) {
      whatWentWell.push("No tasks were blocked at sprint end.");
    }

    // Heuristic: token budget usage
    const tokenUsagePercent =
      sprint.tokenBudget === 0
        ? 0
        : (sprint.tokensUsed / sprint.tokenBudget) * 100;

    if (tokenUsagePercent > 100) {
      whatDidntGoWell.push(
        `Token budget exceeded: ${Math.round(tokenUsagePercent)}% of budget used.`,
      );
      improvements.push("Improve token budget estimation or reduce sprint scope.");
    } else if (tokenUsagePercent <= 80) {
      whatWentWell.push(
        `Token usage was within budget at ${Math.round(tokenUsagePercent)}%.`,
      );
    }

    // Heuristic: drift scores from agent sessions
    const sessions = await db
      .select({
        agentName: agentSessions.agentName,
        driftScore: agentSessions.driftScore,
      })
      .from(agentSessions)
      .where(eq(agentSessions.sprintId, sprintId));

    const highDriftSessions = sessions.filter((s) => s.driftScore >= 3);
    if (highDriftSessions.length > 0) {
      const agentNames = [...new Set(highDriftSessions.map((s) => s.agentName))];
      whatDidntGoWell.push(
        `High drift detected for agent(s): ${agentNames.join(", ")}.`,
      );
      improvements.push(
        "Provide clearer task scoping and goal context to reduce agent drift.",
      );
    } else if (sessions.length > 0) {
      whatWentWell.push("Agent drift scores remained low across the sprint.");
    }

    // Ensure at least one entry in each category
    if (whatWentWell.length === 0) {
      whatWentWell.push("Sprint was completed.");
    }
    if (whatDidntGoWell.length === 0) {
      whatDidntGoWell.push("No significant issues identified.");
    }
    if (improvements.length === 0) {
      improvements.push("Continue current practices.");
    }

    return { whatWentWell, whatDidntGoWell, improvements };
  }
}
