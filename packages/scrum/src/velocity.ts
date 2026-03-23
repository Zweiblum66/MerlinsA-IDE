import { eq, desc } from "drizzle-orm";
import { sprints, userStories, tasks } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export interface BurndownDataPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export class VelocityTracker {
  async recordVelocity(
    sprintId: string,
    pointsCompleted: number,
    db: TheIdeDatabase,
  ): Promise<void> {
    // Store velocity as tokensUsed field repurposed, or more practically,
    // we compute it from completed story points. We record the completed
    // points by updating the sprint's goal context. Since the sprint table
    // doesn't have a dedicated velocity column, we store it in a
    // conventional way by updating the goal field with appended metadata.
    // A cleaner approach: we use the sprint number + project to track
    // velocity from completed stories, so this is a convenience setter.
    const sprintResult = await db
      .select()
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    if (sprintResult.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    // We encode velocity data into the sprint goal field as a suffix.
    // Format: "Original goal [velocity:N]"
    const sprint = sprintResult[0];
    const goalBase = sprint.goal.replace(/\s*\[velocity:\d+\]$/, "");
    const updatedGoal = `${goalBase} [velocity:${pointsCompleted}]`;

    await db
      .update(sprints)
      .set({ goal: updatedGoal })
      .where(eq(sprints.id, sprintId));
  }

  private extractVelocity(goal: string): number | null {
    const match = goal.match(/\[velocity:(\d+)\]$/);
    return match ? parseInt(match[1], 10) : null;
  }

  private async computeVelocityFromStories(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<number> {
    const stories = await db
      .select()
      .from(userStories)
      .where(eq(userStories.sprintId, sprintId));

    let completedPoints = 0;

    for (const story of stories) {
      const storyTasks = await db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.userStoryId, story.id));

      const allDone =
        storyTasks.length > 0 && storyTasks.every((t) => t.status === "DONE");

      if (allDone) {
        completedPoints += story.storyPoints;
      }
    }

    return completedPoints;
  }

  async getAverageVelocity(
    projectId: string,
    lastN: number,
    db: TheIdeDatabase,
  ): Promise<number> {
    const completedSprints = await db
      .select()
      .from(sprints)
      .where(eq(sprints.projectId, projectId))
      .orderBy(desc(sprints.number));

    const finishedSprints = completedSprints.filter(
      (s) => s.status === "COMPLETED",
    );

    const sprintsToConsider = finishedSprints.slice(0, lastN);

    if (sprintsToConsider.length === 0) {
      return 0;
    }

    let totalPoints = 0;
    for (const sprint of sprintsToConsider) {
      const recorded = this.extractVelocity(sprint.goal);
      if (recorded !== null) {
        totalPoints += recorded;
      } else {
        totalPoints += await this.computeVelocityFromStories(sprint.id, db);
      }
    }

    return Math.round(totalPoints / sprintsToConsider.length);
  }

  async predictSprintCapacity(
    projectId: string,
    db: TheIdeDatabase,
  ): Promise<number> {
    const DEFAULT_LOOKBACK = 3;
    return this.getAverageVelocity(projectId, DEFAULT_LOOKBACK, db);
  }

  async getBurndownData(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<BurndownDataPoint[]> {
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

    const totalPoints = stories.reduce((sum, s) => sum + s.storyPoints, 0);

    // Collect all task completion dates
    const completionEvents: Array<{ date: Date; points: number }> = [];

    for (const story of stories) {
      const storyTasks = await db
        .select({ status: tasks.status, completedAt: tasks.completedAt })
        .from(tasks)
        .where(eq(tasks.userStoryId, story.id));

      const allDone =
        storyTasks.length > 0 && storyTasks.every((t) => t.status === "DONE");

      if (allDone) {
        // Use the latest completion date among the story's tasks
        const completionDates = storyTasks
          .filter((t) => t.completedAt !== null)
          .map((t) => t.completedAt as Date);

        if (completionDates.length > 0) {
          const latestDate = completionDates.reduce((latest, d) =>
            d > latest ? d : latest,
          );
          completionEvents.push({ date: latestDate, points: story.storyPoints });
        }
      }
    }

    // Sort completion events chronologically
    completionEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Determine sprint date range
    const startDate = sprint.startDate ?? sprint.createdAt;
    const endDate = sprint.endDate ?? new Date();

    const totalDays = Math.max(
      1,
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ),
    );

    const burndownData: BurndownDataPoint[] = [];
    let remaining = totalPoints;

    for (let day = 0; day <= totalDays; day++) {
      const currentDate = new Date(
        startDate.getTime() + day * 24 * 60 * 60 * 1000,
      );
      const dateStr = currentDate.toISOString().split("T")[0];

      // Subtract points for stories completed on or before this date
      const completedToday = completionEvents.filter(
        (e) => e.date.getTime() <= currentDate.getTime(),
      );
      const pointsDoneSoFar = completedToday.reduce(
        (sum, e) => sum + e.points,
        0,
      );
      remaining = totalPoints - pointsDoneSoFar;

      const ideal =
        totalPoints - (totalPoints * day) / totalDays;

      burndownData.push({
        date: dateStr,
        remaining,
        ideal: Math.round(ideal * 100) / 100,
      });
    }

    return burndownData;
  }
}
