import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { sprints, userStories, tasks } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";
import { SprintStateMachine } from "./state-machine.js";
import type { SprintState } from "./state-machine.js";

export class SprintManager {
  private readonly stateMachine = new SprintStateMachine();

  async createSprint(
    projectId: string,
    number: number,
    goal: string,
    tokenBudget: number,
    db: TheIdeDatabase,
  ) {
    const id = uuidv4();
    const now = new Date();

    await db.insert(sprints).values({
      id,
      projectId,
      number,
      goal,
      status: "PLANNING",
      tokenBudget,
      tokensUsed: 0,
      createdAt: now,
    });

    const result = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, id));

    return result[0];
  }

  async startSprint(sprintId: string, db: TheIdeDatabase) {
    await this.stateMachine.transition(sprintId, "IN_PROGRESS", db);

    await db
      .update(sprints)
      .set({ startDate: new Date() })
      .where(eq(sprints.id, sprintId));

    const result = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    return result[0];
  }

  async getSprint(sprintId: string, db: TheIdeDatabase) {
    const sprintResult = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    if (sprintResult.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    const sprint = sprintResult[0];

    const stories = await db
      .select()
      .from(userStories)
      .where(eq(userStories.sprintId, sprintId));

    const storiesWithTasks = [];
    for (const story of stories) {
      const storyTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.userStoryId, story.id));

      storiesWithTasks.push({
        ...story,
        tasks: storyTasks,
      });
    }

    return {
      ...sprint,
      stories: storiesWithTasks,
    };
  }

  async getActiveSprint(projectId: string, db: TheIdeDatabase) {
    const result = await db
      .select()
      .from(sprints)
      .where(
        and(
          eq(sprints.projectId, projectId),
          eq(sprints.status, "IN_PROGRESS"),
        ),
      );

    if (result.length === 0) {
      return null;
    }

    return this.getSprint(result[0].id, db);
  }

  async completeSprint(sprintId: string, db: TheIdeDatabase) {
    const currentState = await this.stateMachine.getCurrentState(sprintId, db);

    const stateSequence: SprintState[] = [];

    if (currentState === "IN_PROGRESS") {
      stateSequence.push("REVIEW", "RETROSPECTIVE", "COMPLETED");
    } else if (currentState === "REVIEW") {
      stateSequence.push("RETROSPECTIVE", "COMPLETED");
    } else if (currentState === "RETROSPECTIVE") {
      stateSequence.push("COMPLETED");
    } else {
      throw new Error(
        `Cannot complete sprint from state: ${currentState}`,
      );
    }

    for (const state of stateSequence) {
      await this.stateMachine.transition(sprintId, state, db);
    }

    await db
      .update(sprints)
      .set({ endDate: new Date() })
      .where(eq(sprints.id, sprintId));

    const result = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    return result[0];
  }

  async getSprintProgress(sprintId: string, db: TheIdeDatabase) {
    const stories = await db
      .select({ id: userStories.id })
      .from(userStories)
      .where(eq(userStories.sprintId, sprintId));

    const allTasks: Array<{ status: string }> = [];
    for (const story of stories) {
      const storyTasks = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.userStoryId, story.id));
      allTasks.push(...storyTasks);
    }

    const total = allTasks.length;
    const done = allTasks.filter((t) => t.status === "DONE").length;
    const inProgress = allTasks.filter((t) => t.status === "IN_PROGRESS").length;
    const blocked = allTasks.filter((t) => t.status === "BLOCKED").length;
    const percentComplete = total === 0 ? 0 : Math.round((done / total) * 100);

    return {
      total,
      done,
      inProgress,
      blocked,
      percentComplete,
    };
  }
}
