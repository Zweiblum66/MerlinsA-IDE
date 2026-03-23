import type { FastifyInstance } from "fastify";
import { ErrorResponse } from "../schemas/common.js";

interface LoginBody {
  projectId: string;
}

interface JwtPayload {
  projectId: string;
}

/**
 * Registers authentication routes.
 * POST /api/v1/auth/login — issues a JWT for a given projectId.
 * GET  /api/v1/auth/me    — returns the decoded JWT payload for the caller.
 */
export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/auth/login
  fastify.post<{ Body: LoginBody }>(
    "/api/v1/auth/login",
    {
      schema: {
        description: "Issue a JWT token for a project",
        tags: ["auth"],
        body: {
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
              token: { type: "string" },
            },
            required: ["token"],
          },
          400: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.body;

      if (!projectId || typeof projectId !== "string" || projectId.trim() === "") {
        return reply.code(400).send({ error: "Bad Request", message: "projectId is required" });
      }

      const token = fastify.jwt.sign(
        { projectId } satisfies JwtPayload,
        { expiresIn: "24h" },
      );

      return reply.send({ token });
    },
  );

  // GET /api/v1/auth/me
  fastify.get(
    "/api/v1/auth/me",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Return the authenticated caller's JWT payload",
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: "object",
            properties: {
              projectId: { type: "string" },
            },
          },
          401: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const payload = request.user as JwtPayload;
      return reply.send({ projectId: payload.projectId });
    },
  );
}
