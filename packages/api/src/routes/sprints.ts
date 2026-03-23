import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  sprints,
  tasks,
  userStories,
} from "@the-ide/db";
import { ErrorResponse, IdParam, ProjectIdParam } from "../schemas/common.js";

/**
 * Registers all sprint-related routes.
 */
export async function sprintRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/projects/:projectId/sprints
  fastify.get<{ Params: { projectId: string } }>(
    "/api/v1/projects/:projectId/sprints",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "List all sprints for a project",
        tags: ["sprints"],
        params: ProjectIdParam,
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                projectId: { type: "string" },
                number: { type: "number" },
                goal: { type: "string" },
                status: { type: "string" },
                startDate: { type: ["number", "null"] },
                endDate: { type: ["number", "null"] },
                tokenBudget: { type: "number" },
                tokensUsed: { type: "number" },
                createdAt: { type: "string" },
              },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;

      const rows = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, projectId));

      return reply.send(rows);
    },
  );

  // POST /api/v1/sprints
  fastify.post<{
    Body: {
      projectId: string;
      goal: string;
      tokenBudget?: number;
    };
  }>(
    "/api/v1/sprints",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Create a new sprint",
        tags: ["sprints"],
        body: {
          type: "object",
          required: ["projectId", "goal"],
          properties: {
            projectId: { type: "string" },
            goal: { type: "string" },
            tokenBudget: { type: "number" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              projectId: { type: "string" },
              number: { type: "number" },
              goal: { type: "string" },
              status: { type: "string" },
              startDate: { type: ["number", "null"] },
              endDate: { type: ["number", "null"] },
              tokenBudget: { type: "number" },
              tokensUsed: { type: "number" },
              createdAt: { type: "string" },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { projectId, goal, tokenBudget } = request.body;

      const existingSprints = await fastify.db
        .select({ number: sprints.number })
        .from(sprints)
        .where(eq(sprints.projectId, projectId));

      const nextNumber =
        existingSprints.length > 0
          ? Math.max(...existingSprints.map((s) => s.number)) + 1
          : 1;

      const id = uuidv4();
      const now = new Date();

      await fastify.db.insert(sprints).values({
        id,
        projectId,
        number: nextNumber,
        goal,
        status: "PLANNING",
        tokenBudget: tokenBudget ?? 10_000_000,
        tokensUsed: 0,
        createdAt: now,
      });

      const rows = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id));

      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/v1/sprints/:id/start
  fastify.patch<{ Params: { id: string } }>(
    "/api/v1/sprints/:id/start",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Start a sprint — sets status to IN_PROGRESS and records startDate",
        tags: ["sprints"],
        params: IdParam,
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              projectId: { type: "string" },
              number: { type: "number" },
              goal: { type: "string" },
              status: { type: "string" },
              startDate: { type: ["number", "null"] },
              endDate: { type: ["number", "null"] },
              tokenBudget: { type: "number" },
              tokensUsed: { type: "number" },
              createdAt: { type: "string" },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const existing = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id));

      if (existing.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "Sprint not found" });
      }

      const now = new Date();

      await fastify.db
        .update(sprints)
        .set({ status: "IN_PROGRESS", startDate: now })
        .where(eq(sprints.id, id));

      const updated = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id));

      return reply.send(updated[0]);
    },
  );

  // GET /api/v1/sprints/:id/progress
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/sprints/:id/progress",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Get task progress breakdown for a sprint",
        tags: ["sprints"],
        params: IdParam,
        response: {
          200: {
            type: "object",
            properties: {
              total: { type: "number" },
              done: { type: "number" },
              inProgress: { type: "number" },
              blocked: { type: "number" },
              todo: { type: "number" },
              percentComplete: { type: "number" },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const sprintRows = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id));

      if (sprintRows.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "Sprint not found" });
      }

      const taskRows = await fastify.db
        .select({ status: tasks.status })
        .from(tasks)
        .innerJoin(userStories, eq(tasks.userStoryId, userStories.id))
        .where(eq(userStories.sprintId, id));

      const total = taskRows.length;
      const done = taskRows.filter((t) => t.status === "DONE").length;
      const inProgress = taskRows.filter((t) => t.status === "IN_PROGRESS").length;
      const blocked = taskRows.filter((t) => t.status === "BLOCKED").length;
      const todo = taskRows.filter((t) => t.status === "TODO").length;
      const percentComplete = total > 0 ? Math.round((done / total) * 100) : 0;

      return reply.send({ total, done, inProgress, blocked, todo, percentComplete });
    },
  );

  // GET /api/v1/sprints/:id/burndown
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/sprints/:id/burndown",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Get burndown chart data for a sprint",
        tags: ["sprints"],
        params: IdParam,
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                ideal: { type: "number" },
                actual: { type: "number" },
              },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const sprintRows = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.id, id));

      if (sprintRows.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "Sprint not found" });
      }

      const sprint = sprintRows[0]!;

      const taskRows = await fastify.db
        .select({ status: tasks.status, completedAt: tasks.completedAt })
        .from(tasks)
        .innerJoin(userStories, eq(tasks.userStoryId, userStories.id))
        .where(eq(userStories.sprintId, id));

      const total = taskRows.length;

      if (total === 0 || sprint.startDate === null) {
        return reply.send([]);
      }

      const startMs = sprint.startDate.getTime();
      const endMs = sprint.endDate
        ? sprint.endDate.getTime()
        : startMs + 14 * 24 * 60 * 60 * 1000; // default 2-week sprint

      const totalDays = Math.max(
        1,
        Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)),
      );

      // Build a map of day index -> cumulative tasks completed by that day
      const completionsByDay = new Map<number, number>();

      for (const task of taskRows) {
        if (task.status === "DONE" && task.completedAt !== null) {
          const completedMs = task.completedAt.getTime();
          const dayIndex = Math.floor((completedMs - startMs) / (24 * 60 * 60 * 1000));
          const clampedDay = Math.min(Math.max(dayIndex, 0), totalDays);
          completionsByDay.set(clampedDay, (completionsByDay.get(clampedDay) ?? 0) + 1);
        }
      }

      // Build burndown points: remaining tasks per day
      const burndownPoints: Array<{ date: string; ideal: number; actual: number }> = [];
      let cumulativeDone = 0;

      for (let day = 0; day <= totalDays; day++) {
        cumulativeDone += completionsByDay.get(day) ?? 0;
        const remaining = total - cumulativeDone;
        const idealRemaining = total - Math.round((total / totalDays) * day);
        const pointDate = new Date(startMs + day * 24 * 60 * 60 * 1000);

        burndownPoints.push({
          date: pointDate.toISOString().slice(0, 10),
          ideal: Math.max(0, idealRemaining),
          actual: Math.max(0, remaining),
        });
      }

      return reply.send(burndownPoints);
    },
  );
}
