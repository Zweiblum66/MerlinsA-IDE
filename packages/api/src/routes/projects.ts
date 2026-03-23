import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  projects,
  sprints,
  tasks,
  userStories,
  agentSessions,
  apiContracts,
  apiChanges,
  namingViolations,
} from "@the-ide/db";
import { ErrorResponse, IdParam } from "../schemas/common.js";

/**
 * Registers all project-related routes.
 */
export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/projects
  fastify.get(
    "/api/v1/projects",
    {
      schema: {
        description: "List all projects",
        tags: ["projects"],
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                rootPath: { type: "string" },
                techStack: { type: "string" },
                createdAt: { type: "string" },
                updatedAt: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const rows = await fastify.db.select().from(projects);
      return reply.send(rows);
    },
  );

  // GET /api/v1/projects/:id
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id",
    {
      schema: {
        description: "Get a single project by ID",
        tags: ["projects"],
        params: IdParam,
        response: {
          200: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              rootPath: { type: "string" },
              techStack: { type: "string" },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const rows = await fastify.db
        .select()
        .from(projects)
        .where(eq(projects.id, request.params.id));

      if (rows.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "Project not found" });
      }

      return reply.send(rows[0]);
    },
  );

  // POST /api/v1/projects
  fastify.post<{
    Body: {
      name: string;
      description?: string;
      rootPath: string;
      techStack?: Record<string, unknown>;
    };
  }>(
    "/api/v1/projects",
    {
      schema: {
        description: "Create a new project",
        tags: ["projects"],
        body: {
          type: "object",
          required: ["name", "rootPath"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            rootPath: { type: "string" },
            techStack: { type: "object" },
          },
        },
        response: {
          201: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              rootPath: { type: "string" },
              techStack: { type: "string" },
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const id = uuidv4();
      const now = new Date();
      const techStackJson = JSON.stringify(request.body.techStack ?? {});

      await fastify.db.insert(projects).values({
        id,
        name: request.body.name,
        description: request.body.description ?? "",
        rootPath: request.body.rootPath,
        techStack: techStackJson,
        createdAt: now,
        updatedAt: now,
      });

      const rows = await fastify.db
        .select()
        .from(projects)
        .where(eq(projects.id, id));

      return reply.code(201).send(rows[0]);
    },
  );

  // GET /api/v1/projects/:id/health
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/health",
    {
      schema: {
        description: "Run a health audit for the project",
        tags: ["projects"],
        params: IdParam,
        response: {
          200: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              score: { type: "number" },
              checks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    status: { type: "string" },
                    detail: { type: "string" },
                  },
                },
              },
            },
          },
          404: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const projectId = request.params.id;

      const projectRows = await fastify.db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId));

      if (projectRows.length === 0) {
        return reply.code(404).send({ error: "Not Found", message: "Project not found" });
      }

      const checks: Array<{ name: string; status: "pass" | "warn" | "fail"; detail: string }> = [];

      // 1. Sprint status
      const allSprints = await fastify.db
        .select()
        .from(sprints)
        .where(eq(sprints.projectId, projectId));

      const activeSprint = allSprints.find((s) => s.status === "IN_PROGRESS");

      if (activeSprint) {
        checks.push({ name: "Active Sprint", status: "pass", detail: `Sprint ${activeSprint.number} in progress` });
      } else if (allSprints.length > 0) {
        checks.push({ name: "Active Sprint", status: "warn", detail: "No active sprint — consider starting one" });
      } else {
        checks.push({ name: "Active Sprint", status: "fail", detail: "No sprints created yet" });
      }

      // 2. Token budget
      if (activeSprint) {
        const budgetPercent = activeSprint.tokenBudget > 0
          ? Math.round((activeSprint.tokensUsed / activeSprint.tokenBudget) * 100)
          : 0;

        if (budgetPercent >= 100) {
          checks.push({ name: "Token Budget", status: "fail", detail: `EXCEEDED — ${budgetPercent}% used` });
        } else if (budgetPercent >= 85) {
          checks.push({ name: "Token Budget", status: "warn", detail: `CRITICAL — ${budgetPercent}% used` });
        } else {
          checks.push({ name: "Token Budget", status: "pass", detail: `${budgetPercent}% used` });
        }
      }

      // 3. Blocked tasks
      if (activeSprint) {
        const blockedRows = await fastify.db
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(userStories, eq(tasks.userStoryId, userStories.id))
          .where(and(eq(userStories.sprintId, activeSprint.id), eq(tasks.status, "BLOCKED")));

        if (blockedRows.length === 0) {
          checks.push({ name: "Blocked Tasks", status: "pass", detail: "No blocked tasks" });
        } else if (blockedRows.length <= 2) {
          checks.push({ name: "Blocked Tasks", status: "warn", detail: `${blockedRows.length} blocked` });
        } else {
          checks.push({ name: "Blocked Tasks", status: "fail", detail: `${blockedRows.length} blocked — impediment likely` });
        }
      }

      // 4. API contract drift
      const breakingChanges = await fastify.db
        .select({ id: apiChanges.id })
        .from(apiChanges)
        .innerJoin(apiContracts, eq(apiChanges.contractId, apiContracts.id))
        .where(and(eq(apiContracts.projectId, projectId), eq(apiChanges.isBreaking, true)));

      if (breakingChanges.length === 0) {
        checks.push({ name: "API Contracts", status: "pass", detail: "No breaking changes" });
      } else {
        checks.push({ name: "API Contracts", status: "fail", detail: `${breakingChanges.length} breaking changes detected` });
      }

      // 5. Naming violations
      const violationRows = await fastify.db
        .select({ id: namingViolations.id })
        .from(namingViolations)
        .where(eq(namingViolations.projectId, projectId));

      if (violationRows.length === 0) {
        checks.push({ name: "Naming Conventions", status: "pass", detail: "No violations" });
      } else if (violationRows.length <= 5) {
        checks.push({ name: "Naming Conventions", status: "warn", detail: `${violationRows.length} violations` });
      } else {
        checks.push({ name: "Naming Conventions", status: "fail", detail: `${violationRows.length} violations` });
      }

      // 6. Agent drift
      if (activeSprint) {
        const sessionRows = await fastify.db
          .select()
          .from(agentSessions)
          .where(eq(agentSessions.sprintId, activeSprint.id));

        const highDriftSessions = sessionRows.filter((s) => s.driftScore >= 3);

        if (highDriftSessions.length === 0) {
          checks.push({ name: "Goal Drift", status: "pass", detail: "All agents on track" });
        } else {
          const names = highDriftSessions.map((s) => s.agentName).join(", ");
          checks.push({ name: "Goal Drift", status: "fail", detail: `High drift: ${names}` });
        }

        // 7. Failed agents
        const failedSessions = sessionRows.filter((s) => s.status === "FAILED");
        if (failedSessions.length === 0) {
          checks.push({ name: "Agent Failures", status: "pass", detail: "No failures" });
        } else {
          checks.push({ name: "Agent Failures", status: "fail", detail: `${failedSessions.length} agent(s) failed` });
        }
      }

      const passCount = checks.filter((c) => c.status === "pass").length;
      const score = Math.round((passCount / checks.length) * 100);

      return reply.send({ projectId, score, checks });
    },
  );
}
