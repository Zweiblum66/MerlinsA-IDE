import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { epics, userStories, tasks } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export class BacklogManager {
  async createEpic(
    projectId: string,
    title: string,
    description: string,
    db: TheIdeDatabase,
  ) {
    const id = uuidv4();
    const now = new Date();

    await db.insert(epics).values({
      id,
      projectId,
      title,
      description,
      priority: 0,
      status: "BACKLOG",
      createdAt: now,
    });

    const result = await db
      .select()
      .from(epics)
      .where(eq(epics.id, id));

    return result[0];
  }

  async createUserStory(
    epicId: string,
    title: string,
    description: string,
    acceptanceCriteria: string[],
    storyPoints: number,
    db: TheIdeDatabase,
  ) {
    const id = uuidv4();
    const now = new Date();

    await db.insert(userStories).values({
      id,
      epicId,
      title,
      description,
      acceptanceCriteria: JSON.stringify(acceptanceCriteria),
      storyPoints,
      priority: 0,
      status: "BACKLOG",
      createdAt: now,
    });

    const result = await db
      .select()
      .from(userStories)
      .where(eq(userStories.id, id));

    return result[0];
  }

  async createTask(
    userStoryId: string,
    title: string,
    description: string,
    assignedAgent: string | null,
    scopeFiles: string[],
    dependencies: string[],
    db: TheIdeDatabase,
  ) {
    const id = uuidv4();
    const now = new Date();

    await db.insert(tasks).values({
      id,
      userStoryId,
      title,
      description,
      assignedAgent,
      status: "TODO",
      scopeFiles: JSON.stringify(scopeFiles),
      dependencies: JSON.stringify(dependencies),
      createdAt: now,
    });

    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, id));

    return result[0];
  }

  async getBacklog(projectId: string, db: TheIdeDatabase) {
    const projectEpics = await db
      .select()
      .from(epics)
      .where(eq(epics.projectId, projectId));

    const result = [];
    for (const epic of projectEpics) {
      const stories = await db
        .select()
        .from(userStories)
        .where(eq(userStories.epicId, epic.id));

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

      result.push({
        ...epic,
        stories: storiesWithTasks,
      });
    }

    return result;
  }

  async updateTaskStatus(
    taskId: string,
    status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "DONE",
    db: TheIdeDatabase,
  ) {
    if (status === "DONE") {
      await db
        .update(tasks)
        .set({ status, completedAt: new Date() })
        .where(eq(tasks.id, taskId));
    } else {
      await db
        .update(tasks)
        .set({ status })
        .where(eq(tasks.id, taskId));
    }

    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));

    return result[0];
  }

  async getTasksByAgent(
    agentName: string,
    sprintId: string,
    db: TheIdeDatabase,
  ) {
    const stories = await db
      .select({ id: userStories.id })
      .from(userStories)
      .where(eq(userStories.sprintId, sprintId));

    const agentTasks = [];
    for (const story of stories) {
      const storyTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userStoryId, story.id),
            eq(tasks.assignedAgent, agentName),
          ),
        );
      agentTasks.push(...storyTasks);
    }

    return agentTasks;
  }

  async getBlockedTasks(sprintId: string, db: TheIdeDatabase) {
    const stories = await db
      .select({ id: userStories.id })
      .from(userStories)
      .where(eq(userStories.sprintId, sprintId));

    const blockedTasks = [];
    for (const story of stories) {
      const storyTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userStoryId, story.id),
            eq(tasks.status, "BLOCKED"),
          ),
        );
      blockedTasks.push(...storyTasks);
    }

    return blockedTasks;
  }

  async assignTaskToSprint(
    taskId: string,
    sprintId: string,
    db: TheIdeDatabase,
  ) {
    const taskResult = await db
      .select({ userStoryId: tasks.userStoryId })
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (taskResult.length === 0) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const userStoryId = taskResult[0].userStoryId;

    await db
      .update(userStories)
      .set({ sprintId, status: "PLANNED" })
      .where(eq(userStories.id, userStoryId));
  }
}
