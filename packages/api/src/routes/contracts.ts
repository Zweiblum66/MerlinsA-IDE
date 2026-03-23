import type { FastifyInstance } from "fastify";
import { eq, and, sql } from "drizzle-orm";
import { apiContracts, apiChanges } from "@the-ide/db";
import { ErrorResponse, IdParam } from "../schemas/common.js";

/**
 * Registers all API contract routes.
 */
export async function contractRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/contracts
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/api/v1/contracts",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "List all API contracts with optional project filter",
        tags: ["contracts"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                method: { type: "string" },
                path: { type: "string" },
                version: { type: "number" },
                requestSchema: {},
                responseSchema: {},
                registeredAt: { type: "number" },
                hasBreakingChanges: { type: "boolean" },
                breakingChangesCount: { type: "number" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.query;

      const whereClause = projectId
        ? eq(apiContracts.projectId, projectId)
        : undefined;

      const rows = whereClause
        ? await fastify.db.select().from(apiContracts).where(whereClause)
        : await fastify.db.select().from(apiContracts);

      const result = await Promise.all(
        rows.map(async (contract) => {
          const breakingRows = await fastify.db
            .select({ count: sql<number>`count(*)` })
            .from(apiChanges)
            .where(
              and(
                eq(apiChanges.contractId, contract.id),
                eq(apiChanges.isBreaking, true),
              ),
            );

          const breakingChangesCount = breakingRows[0]?.count ?? 0;
          const isBreaking = breakingChangesCount > 0;

          return {
            id: contract.id,
            method: contract.method,
            path: contract.path,
            version: contract.version,
            requestSchema: contract.requestSchema,
            responseSchema: contract.responseSchema,
            registeredAt: contract.createdAt instanceof Date
              ? contract.createdAt.getTime()
              : Number(contract.createdAt),
            hasBreakingChanges: isBreaking,
            breakingChangesCount,
          };
        }),
      );

      return reply.send(result);
    },
  );

  // GET /api/v1/contracts/:id/changes
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/contracts/:id/changes",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "List change history for a specific API contract",
        tags: ["contracts"],
        security: [{ bearerAuth: [] }],
        params: IdParam,
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                contractId: { type: "string" },
                changeType: { type: "string" },
                isBreaking: { type: "boolean" },
                description: { type: "string" },
                oldValue: {},
                newValue: {},
                detectedAt: { type: "number" },
              },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const contractId = request.params.id;

      const contractRows = await fastify.db
        .select({ id: apiContracts.id })
        .from(apiContracts)
        .where(eq(apiContracts.id, contractId));

      if (contractRows.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "Contract not found" });
      }

      const changeRows = await fastify.db
        .select()
        .from(apiChanges)
        .where(eq(apiChanges.contractId, contractId));

      const result = changeRows.map((change) => ({
        id: change.id,
        contractId: change.contractId,
        changeType: change.changeType,
        isBreaking: change.isBreaking,
        description: change.fieldPath
          ? `${change.changeType} ${change.fieldPath}`
          : change.changeType,
        oldValue: change.oldValue,
        newValue: change.newValue,
        detectedAt: change.changedAt instanceof Date
          ? change.changedAt.getTime()
          : Number(change.changedAt),
      }));

      return reply.send(result);
    },
  );
}
