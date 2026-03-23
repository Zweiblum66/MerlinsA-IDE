import { eq } from "drizzle-orm";
import { tasks, userStories } from "@the-ide/db";
import type { TheIdeDatabase } from "@the-ide/db";

export interface DoDCheck {
  name: string;
  isPassing: boolean;
  details: string;
}

export interface DoDResult {
  isPassing: boolean;
  checks: DoDCheck[];
}

type TaskRow = typeof tasks.$inferSelect;
type UserStoryRow = typeof userStories.$inferSelect;

export class DefinitionOfDoneChecker {
  async checkTask(taskId: string, db: TheIdeDatabase): Promise<DoDResult> {
    const taskResult = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));

    if (taskResult.length === 0) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const task = taskResult[0];

    const storyResult = await db
      .select()
      .from(userStories)
      .where(eq(userStories.id, task.userStoryId));

    const story = storyResult.length > 0 ? storyResult[0] : null;

    const checks: DoDCheck[] = [
      await this.checkAcceptanceCriteriaMet(task, story),
      await this.checkTestsPass(task),
      await this.checkNoNamingViolations(task),
      await this.checkApiContractsConsistent(task),
      await this.checkNoTypeErrors(task),
      await this.checkCodeReviewApproved(task),
    ];

    const isPassing = checks.every((c) => c.isPassing);

    return { isPassing, checks };
  }

  private async checkAcceptanceCriteriaMet(
    _task: TaskRow,
    _story: UserStoryRow | null,
  ): Promise<DoDCheck> {
    // Placeholder: in a full implementation, this would verify each
    // acceptance criterion from the parent user story is satisfied.
    return {
      name: "acceptanceCriteriaMet",
      isPassing: true,
      details: "Not yet implemented — requires manual verification of acceptance criteria.",
    };
  }

  private async checkTestsPass(
    _task: TaskRow,
  ): Promise<DoDCheck> {
    // Placeholder: would run the project test suite scoped to the
    // task's scopeFiles and verify all tests pass.
    return {
      name: "testsPass",
      isPassing: true,
      details: "Not yet implemented — requires test runner integration.",
    };
  }

  private async checkNoNamingViolations(
    _task: TaskRow,
  ): Promise<DoDCheck> {
    // Placeholder: would query namingViolations table for any
    // unresolved violations in the task's scope files.
    return {
      name: "noNamingViolations",
      isPassing: true,
      details: "Not yet implemented — requires naming convention checker integration.",
    };
  }

  private async checkApiContractsConsistent(
    _task: TaskRow,
  ): Promise<DoDCheck> {
    // Placeholder: would verify that any API changes introduced by
    // this task are backward-compatible or properly versioned.
    return {
      name: "apiContractsConsistent",
      isPassing: true,
      details: "Not yet implemented — requires API contract validation.",
    };
  }

  private async checkNoTypeErrors(
    _task: TaskRow,
  ): Promise<DoDCheck> {
    // Placeholder: would run the TypeScript compiler on the task's
    // scope files and check for type errors.
    return {
      name: "noTypeErrors",
      isPassing: true,
      details: "Not yet implemented — requires TypeScript compiler integration.",
    };
  }

  private async checkCodeReviewApproved(
    _task: TaskRow,
  ): Promise<DoDCheck> {
    // Placeholder: would check whether another agent or human has
    // reviewed and approved the code changes.
    return {
      name: "codeReviewApproved",
      isPassing: true,
      details: "Not yet implemented — requires code review workflow integration.",
    };
  }
}
