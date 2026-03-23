import type { FastifyInstance } from "fastify";
import { eq, and, sql, count } from "drizzle-orm";
import { namingViolations } from "@the-ide/db";
import { ErrorResponse } from "../schemas/common.js";

/**
 * Derives a display severity from the DB severity value.
 * Maps "error" to "ERROR" and "warning" to "WARNING".
 * Falls back to "WARNING" for unknown values.
 */
function mapSeverity(dbSeverity: string): "ERROR" | "WARNING" {
  return dbSeverity === "error" ? "ERROR" : "WARNING";
}

/**
 * Registers all naming convention routes.
 */
export async function namingRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/naming/violations
  fastify.get<{ Querystring: { projectId?: string; filePath?: string } }>(
    "/api/v1/naming/violations",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "List naming convention violations with optional filters",
        tags: ["naming"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            filePath: { type: "string" },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                filePath: { type: "string" },
                line: { type: "number" },
                identifier: { type: "string" },
                expectedFormat: { type: "string" },
                suggestion: { type: "string" },
                severity: { type: "string" },
                detectedAt: { type: "number" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId, filePath } = request.query;

      const conditions = [];
      if (projectId) {
        conditions.push(eq(namingViolations.projectId, projectId));
      }
      if (filePath) {
        conditions.push(eq(namingViolations.filePath, filePath));
      }

      const rows = conditions.length > 0
        ? await fastify.db
            .select()
            .from(namingViolations)
            .where(conditions.length === 1 ? conditions[0] : and(...conditions))
        : await fastify.db.select().from(namingViolations);

      const result = rows.map((violation) => ({
        id: violation.id,
        filePath: violation.filePath,
        line: violation.line,
        identifier: violation.identifierName,
        expectedFormat: violation.expectedFormat,
        suggestion: violation.rule,
        severity: mapSeverity(violation.severity),
        detectedAt: violation.detectedAt instanceof Date
          ? violation.detectedAt.getTime()
          : Number(violation.detectedAt),
      }));

      return reply.send(result);
    },
  );

  // GET /api/v1/naming/summary
  fastify.get<{ Querystring: { projectId?: string } }>(
    "/api/v1/naming/summary",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Aggregate naming violation statistics with optional project filter",
        tags: ["naming"],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: "object",
          properties: {
            projectId: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              totalViolations: { type: "number" },
              errorCount: { type: "number" },
              warningCount: { type: "number" },
              filesAffected: { type: "number" },
              lastCheckedAt: { type: "number" },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.query;

      const whereClause = projectId
        ? eq(namingViolations.projectId, projectId)
        : undefined;

      const rows = whereClause
        ? await fastify.db.select().from(namingViolations).where(whereClause)
        : await fastify.db.select().from(namingViolations);

      const totalViolations = rows.length;
      const errorCount = rows.filter((v) => v.severity === "error").length;
      const warningCount = rows.filter((v) => v.severity === "warning").length;

      const uniqueFiles = new Set(rows.map((v) => v.filePath));
      const filesAffected = uniqueFiles.size;

      const lastCheckedAt = rows.reduce((max, v) => {
        const ts = v.detectedAt instanceof Date
          ? v.detectedAt.getTime()
          : Number(v.detectedAt);
        return ts > max ? ts : max;
      }, 0);

      return reply.send({
        totalViolations,
        errorCount,
        warningCount,
        filesAffected,
        lastCheckedAt,
      });
    },
  );
}
