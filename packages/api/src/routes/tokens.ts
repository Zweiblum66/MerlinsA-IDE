import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { tokenUsage, agentSessions, sprints } from "@the-ide/db";
import { ErrorResponse } from "../schemas/common.js";

/** Blended USD cost per million tokens used for budget estimation. */
const USD_PER_MILLION_TOKENS = 3.0;

/**
 * Formats a Date object as a YYYY-MM-DD string.
 */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Registers all token analytics routes.
 */
export async function tokenRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/tokens/by-model
  fastify.get<{
    Querystring: { sprintId?: string; projectId?: string };
  }>(
    "/api/v1/tokens/by-model",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Token usage aggregated by model, optionally filtered by sprintId",
        tags: ["tokens"],
        querystring: {
          type: "object",
          properties: {
            sprintId: { type: "string" },
            projectId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                model: { type: "string" },
                totalTokens: { type: "number" },
                inputTokens: { type: "number" },
                outputTokens: { type: "number" },
                costUsd: { type: "number" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { sprintId, projectId } = request.query;

      let rows: Array<typeof tokenUsage.$inferSelect>;

      if (sprintId) {
        rows = await fastify.db
          .select()
          .from(tokenUsage)
          .where(eq(tokenUsage.sprintId, sprintId));
      } else if (projectId) {
        // Filter via sprint relationship: tokenUsage.sprintId -> sprints.projectId
        const projectSprints = await fastify.db
          .select({ id: sprints.id })
          .from(sprints)
          .where(eq(sprints.projectId, projectId));

        const sprintIds = projectSprints.map((s) => s.id);

        if (sprintIds.length === 0) {
          return reply.send([]);
        }

        rows = await fastify.db.select().from(tokenUsage);
        rows = rows.filter((r) => r.sprintId !== null && sprintIds.includes(r.sprintId));
      } else {
        rows = await fastify.db.select().from(tokenUsage);
      }

      // Aggregate by model
      const byModel = new Map<
        string,
        { model: string; totalTokens: number; inputTokens: number; outputTokens: number; costUsd: number }
      >();

      for (const row of rows) {
        const existing = byModel.get(row.model);
        const totalTokens = row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens;

        if (existing) {
          existing.totalTokens += totalTokens;
          existing.inputTokens += row.inputTokens;
          existing.outputTokens += row.outputTokens;
          existing.costUsd += row.costUsd;
        } else {
          byModel.set(row.model, {
            model: row.model,
            totalTokens,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens,
            costUsd: row.costUsd,
          });
        }
      }

      return reply.send(Array.from(byModel.values()));
    },
  );

  // GET /api/v1/tokens/by-agent
  fastify.get<{
    Querystring: { projectId?: string; sprintId?: string };
  }>(
    "/api/v1/tokens/by-agent",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Token usage aggregated by agent name",
        tags: ["tokens"],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            sprintId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                agentName: { type: "string" },
                totalTokens: { type: "number" },
                costUsd: { type: "number" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId, sprintId } = request.query;

      // Join tokenUsage with agentSessions to get agentName
      const joinedRows = await fastify.db
        .select({
          agentName: agentSessions.agentName,
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          cacheReadTokens: tokenUsage.cacheReadTokens,
          cacheCreationTokens: tokenUsage.cacheCreationTokens,
          costUsd: tokenUsage.costUsd,
          sprintId: tokenUsage.sprintId,
        })
        .from(tokenUsage)
        .innerJoin(agentSessions, eq(tokenUsage.sessionId, agentSessions.id));

      let filteredRows = joinedRows;

      if (sprintId) {
        filteredRows = filteredRows.filter((r) => r.sprintId === sprintId);
      } else if (projectId) {
        const projectSprints = await fastify.db
          .select({ id: sprints.id })
          .from(sprints)
          .where(eq(sprints.projectId, projectId));

        const sprintIds = new Set(projectSprints.map((s) => s.id));
        filteredRows = filteredRows.filter((r) => r.sprintId !== null && sprintIds.has(r.sprintId));
      }

      // Aggregate by agentName
      const byAgent = new Map<string, { agentName: string; totalTokens: number; costUsd: number }>();

      for (const row of filteredRows) {
        const totalTokens =
          row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens;
        const existing = byAgent.get(row.agentName);

        if (existing) {
          existing.totalTokens += totalTokens;
          existing.costUsd += row.costUsd;
        } else {
          byAgent.set(row.agentName, {
            agentName: row.agentName,
            totalTokens,
            costUsd: row.costUsd,
          });
        }
      }

      return reply.send(Array.from(byAgent.values()));
    },
  );

  // GET /api/v1/tokens/timeline
  fastify.get<{
    Querystring: { projectId?: string; sprintId?: string };
  }>(
    "/api/v1/tokens/timeline",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Token usage aggregated by day in chronological order",
        tags: ["tokens"],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            sprintId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                tokens: { type: "number" },
                costUsd: { type: "number" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId, sprintId } = request.query;

      let rows: Array<typeof tokenUsage.$inferSelect>;

      if (sprintId) {
        rows = await fastify.db
          .select()
          .from(tokenUsage)
          .where(eq(tokenUsage.sprintId, sprintId));
      } else if (projectId) {
        const projectSprints = await fastify.db
          .select({ id: sprints.id })
          .from(sprints)
          .where(eq(sprints.projectId, projectId));

        const sprintIds = projectSprints.map((s) => s.id);

        if (sprintIds.length === 0) {
          return reply.send([]);
        }

        const allRows = await fastify.db.select().from(tokenUsage);
        rows = allRows.filter((r) => r.sprintId !== null && sprintIds.includes(r.sprintId));
      } else {
        rows = await fastify.db.select().from(tokenUsage);
      }

      // Group by date string (YYYY-MM-DD)
      const byDay = new Map<string, { date: string; tokens: number; costUsd: number }>();

      for (const row of rows) {
        const dateKey = toDateString(row.timestamp);
        const totalTokens =
          row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens;
        const existing = byDay.get(dateKey);

        if (existing) {
          existing.tokens += totalTokens;
          existing.costUsd += row.costUsd;
        } else {
          byDay.set(dateKey, { date: dateKey, tokens: totalTokens, costUsd: row.costUsd });
        }
      }

      // Return sorted ascending by date
      const timeline = Array.from(byDay.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );

      return reply.send(timeline);
    },
  );

  // GET /api/v1/tokens/budget
  fastify.get<{
    Querystring: { projectId: string };
  }>(
    "/api/v1/tokens/budget",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Token budget vs spend for the active sprint in a project",
        tags: ["tokens"],
        querystring: {
          type: "object",
          required: ["projectId"],
          properties: {
            projectId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              budgetUsd: { type: "number" },
              spentUsd: { type: "number" },
              remainingUsd: { type: "number" },
              percentUsed: { type: "number" },
              willExceed: { type: "boolean" },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.query;

      // Find the active sprint for this project
      const projectSprints = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, projectId));

      const activeSprint =
        projectSprints.find((s) => s.status === "IN_PROGRESS") ??
        projectSprints.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ??
        null;

      if (activeSprint === null) {
        return reply.code(404).send({
          error: "Not Found",
          message: "No sprints found for this project",
        });
      }

      // Compute spent USD from tokenUsage records for the active sprint
      const usageRows = await fastify.db
        .select({ costUsd: tokenUsage.costUsd })
        .from(tokenUsage)
        .where(eq(tokenUsage.sprintId, activeSprint.id));

      const spentUsd = usageRows.reduce((acc, r) => acc + r.costUsd, 0);

      // Convert token budget to USD using blended rate
      const budgetUsd =
        (activeSprint.tokenBudget / 1_000_000) * USD_PER_MILLION_TOKENS;

      const remainingUsd = Math.max(0, budgetUsd - spentUsd);
      const percentUsed =
        budgetUsd > 0 ? Math.round((spentUsd / budgetUsd) * 100) : 0;
      const willExceed = spentUsd >= budgetUsd;

      return reply.send({
        projectId,
        budgetUsd,
        spentUsd,
        remainingUsd,
        percentUsed,
        willExceed,
      });
    },
  );
}
