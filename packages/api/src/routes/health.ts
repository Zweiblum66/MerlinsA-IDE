import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";

/**
 * Registers the health check endpoint.
 * GET /api/v1/health
 */
export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/api/v1/health",
    {
      schema: {
        description: "Server health check",
        tags: ["health"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              uptime: { type: "number" },
              version: { type: "string" },
              dbConnected: { type: "boolean" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      let isDbConnected = false;
      try {
        fastify.db.run(sql`SELECT 1`);
        isDbConnected = true;
      } catch {
        isDbConnected = false;
      }

      return reply.send({
        status: "ok",
        uptime: process.uptime(),
        version: "0.1.0",
        dbConnected: isDbConnected,
      });
    },
  );
}
