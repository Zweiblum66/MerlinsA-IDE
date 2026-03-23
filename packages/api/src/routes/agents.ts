import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { agentSessions } from "@the-ide/db";

/** Hard-coded agent definition entry. */
interface AgentDefinition {
  name: string;
  model: string;
  description: string;
  tools: string[];
}

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    name: "product-owner",
    model: "claude-sonnet-4-5",
    description: "Manages the product backlog, writes user stories, and prioritises features.",
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
  },
  {
    name: "scrum-master",
    model: "claude-sonnet-4-5",
    description: "Orchestrates the scrum team, manages sprint ceremonies, and removes impediments.",
    tools: ["Read", "Write", "Bash", "Glob", "Grep", "Task"],
  },
  {
    name: "architect",
    model: "claude-sonnet-4-5",
    description: "Designs system architecture, defines technical contracts, and reviews structural decisions.",
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
  },
  {
    name: "developer",
    model: "claude-sonnet-4-5",
    description: "Implements features, writes unit tests, and follows coding conventions.",
    tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  },
  {
    name: "qa-engineer",
    model: "claude-haiku-4-5",
    description: "Writes integration and end-to-end tests, validates acceptance criteria.",
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
  },
  {
    name: "devops-engineer",
    model: "claude-haiku-4-5",
    description: "Manages CI/CD pipelines, deployment configuration, and infrastructure.",
    tools: ["Read", "Write", "Bash", "Glob", "Grep"],
  },
  {
    name: "api-guardian",
    model: "claude-haiku-4-5",
    description: "Enforces API contract compliance, detects drift, and flags breaking changes.",
    tools: ["Read", "Bash", "Glob", "Grep"],
  },
];

/**
 * Maps an agent session status to a human-readable activity event string.
 */
function statusToEvent(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "agent_started";
    case "COMPLETED":
      return "agent_completed";
    case "FAILED":
      return "agent_failed";
    case "PAUSED":
      return "agent_paused";
    default:
      return "agent_updated";
  }
}

/**
 * Registers all agent-related routes.
 */
export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/agents/sessions
  fastify.get<{
    Querystring: { sprintId?: string; projectId?: string };
  }>(
    "/api/v1/agents/sessions",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "List agent sessions with optional sprintId or projectId filter",
        tags: ["agents"],
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
                id: { type: "string" },
                agentName: { type: "string" },
                model: { type: "string" },
                status: { type: "string" },
                tokensUsed: { type: "number" },
                costUsd: { type: "number" },
                hasDrift: { type: "boolean" },
                startedAt: { type: "number" },
                completedAt: { type: ["number", "null"] },
                taskId: { type: ["string", "null"] },
                projectId: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { sprintId } = request.query;

      const rows = sprintId
        ? await fastify.db
            .select()
            .from(agentSessions)
            .where(eq(agentSessions.sprintId, sprintId))
        : await fastify.db.select().from(agentSessions);

      const result = rows.map((session) => ({
        id: session.id,
        agentName: session.agentName,
        model: session.model,
        status: session.status,
        tokensUsed: 0,
        costUsd: session.costUsd,
        hasDrift: session.driftScore >= 3,
        startedAt: session.startedAt.getTime(),
        completedAt: session.endedAt ? session.endedAt.getTime() : null,
        taskId: session.taskId ?? null,
        projectId: null,
      }));

      return reply.send(result);
    },
  );

  // GET /api/v1/agents/definitions
  fastify.get(
    "/api/v1/agents/definitions",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Return the hardcoded list of agent definitions",
        tags: ["agents"],
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                model: { type: "string" },
                description: { type: "string" },
                tools: {
                  type: "array",
                  items: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.send(AGENT_DEFINITIONS);
    },
  );

  // GET /api/v1/agents/activity
  fastify.get<{
    Querystring: { limit?: number };
  }>(
    "/api/v1/agents/activity",
    {
      preHandler: [fastify.authenticate],
      schema: {
        description: "Recent agent activity feed ordered by most recent first",
        tags: ["agents"],
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                agentName: { type: "string" },
                event: { type: "string" },
                timestamp: { type: "number" },
                detail: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const limit = request.query.limit ?? 20;

      const rows = await fastify.db
        .select()
        .from(agentSessions)
        .orderBy(desc(agentSessions.startedAt))
        .limit(limit);

      const activity = rows.map((session) => ({
        id: session.id,
        agentName: session.agentName,
        event: statusToEvent(session.status),
        timestamp: session.startedAt.getTime(),
        detail: session.taskId ? `Task: ${session.taskId}` : null,
      }));

      return reply.send(activity);
    },
  );
}
