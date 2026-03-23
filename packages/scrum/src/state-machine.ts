import { eq } from "drizzle-orm";
import { sprints, tasks, userStories } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

/** States stored in the database. */
export type SprintDbState =
  | "PLANNING"
  | "IN_PROGRESS"
  | "REVIEW"
  | "RETROSPECTIVE"
  | "COMPLETED";

/**
 * All logical states the sprint state machine recognises.
 * IMPEDIMENT is a transient state managed by the state machine but
 * persisted as a regular DB status value when needed.
 */
export type SprintState = SprintDbState | "IMPEDIMENT";

export interface SprintTransition {
  from: SprintState;
  to: SprintState;
  guard: (sprintId: string, db: TheIdeDatabase) => Promise<boolean>;
}

async function getSprintTasks(
  sprintId: string,
  db: TheIdeDatabase,
): Promise<Array<{ status: string }>> {
  const stories = await db
    .select({ id: userStories.id })
    .from(userStories)
    .where(eq(userStories.sprintId, sprintId));

  if (stories.length === 0) return [];

  const allTasks: Array<{ status: string }> = [];
  for (const story of stories) {
    const storyTasks = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.userStoryId, story.id));
    allTasks.push(...storyTasks);
  }
  return allTasks;
}

const TRANSITIONS: SprintTransition[] = [
  {
    from: "PLANNING",
    to: "IN_PROGRESS",
    guard: async (sprintId, db) => {
      const sprintTasks = await getSprintTasks(sprintId, db);
      const assignedTasks = sprintTasks.filter(
        (t) => t.status !== undefined,
      );
      return assignedTasks.length >= 1;
    },
  },
  {
    from: "IN_PROGRESS",
    to: "REVIEW",
    guard: async (sprintId, db) => {
      const sprintTasks = await getSprintTasks(sprintId, db);
      if (sprintTasks.length === 0) return false;
      return sprintTasks.every(
        (t) => t.status === "DONE" || t.status === "BLOCKED",
      );
    },
  },
  {
    from: "IN_PROGRESS",
    to: "IMPEDIMENT",
    guard: async (sprintId, db) => {
      const sprintTasks = await getSprintTasks(sprintId, db);
      return sprintTasks.some((t) => t.status === "BLOCKED");
    },
  },
  {
    from: "IMPEDIMENT" as SprintState,
    to: "IN_PROGRESS",
    guard: async (sprintId, db) => {
      const sprintTasks = await getSprintTasks(sprintId, db);
      return sprintTasks.every((t) => t.status !== "BLOCKED");
    },
  },
  {
    from: "REVIEW",
    to: "RETROSPECTIVE",
    guard: async (_sprintId, _db) => {
      // Review is considered complete when this transition is explicitly triggered.
      // In a full implementation, this would check review artifacts.
      return true;
    },
  },
  {
    from: "RETROSPECTIVE",
    to: "COMPLETED",
    guard: async (_sprintId, _db) => {
      return true;
    },
  },
];

export class SprintStateMachine {
  private readonly transitions: SprintTransition[] = TRANSITIONS;

  async getCurrentState(
    sprintId: string,
    db: TheIdeDatabase,
  ): Promise<SprintState> {
    const result = await db
      .select({ status: sprints.status })
      .from(sprints)
      .where(eq(sprints.id, sprintId));

    if (result.length === 0) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }

    return result[0].status as SprintState;
  }

  async canTransition(
    sprintId: string,
    to: SprintState,
    db: TheIdeDatabase,
  ): Promise<boolean> {
    const currentState = await this.getCurrentState(sprintId, db);

    const transition = this.transitions.find(
      (t) => t.from === currentState && t.to === to,
    );

    if (!transition) {
      return false;
    }

    return transition.guard(sprintId, db);
  }

  async transition(
    sprintId: string,
    to: SprintState,
    db: TheIdeDatabase,
  ): Promise<void> {
    const currentState = await this.getCurrentState(sprintId, db);

    const transition = this.transitions.find(
      (t) => t.from === currentState && t.to === to,
    );

    if (!transition) {
      throw new Error(
        `Invalid transition: ${currentState} → ${to}`,
      );
    }

    const allowed = await transition.guard(sprintId, db);
    if (!allowed) {
      throw new Error(
        `Transition guard failed: ${currentState} → ${to}`,
      );
    }

    await db
      .update(sprints)
      .set({ status: to as typeof sprints.$inferInsert.status })
      .where(eq(sprints.id, sprintId));
  }
}
