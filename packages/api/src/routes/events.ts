import type { FastifyInstance } from "fastify";

interface EventsQuerystring {
  token: string;
}

/**
 * Registers the SSE event stream route.
 * GET /api/v1/events — streams real-time events to the client over
 * Server-Sent Events. Authentication is performed via a `token` query
 * parameter because browser EventSource cannot set Authorization headers.
 */
export async function eventsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Querystring: EventsQuerystring }>(
    "/api/v1/events",
    {
      schema: {
        description: "SSE stream of real-time IDE events",
        tags: ["events"],
        querystring: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { token } = request.query;

      try {
        await fastify.jwt.verify(token);
      } catch {
        return reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing token" });
      }

      const rawReply = reply.raw;

      rawReply.setHeader("Content-Type", "text/event-stream");
      rawReply.setHeader("Cache-Control", "no-cache");
      rawReply.setHeader("Connection", "keep-alive");
      rawReply.flushHeaders();

      // Send initial keepalive comment so the client knows the stream is open.
      rawReply.write(":keepalive\n\n");

      const unsubscribe = fastify.eventBus.subscribe((event, data) => {
        const payload = JSON.stringify({ event, data });
        rawReply.write(`data: ${payload}\n\n`);
      });

      request.raw.on("close", () => {
        unsubscribe();
      });

      // Keep the request open — do not call reply.send().
      await new Promise<void>((resolve) => {
        request.raw.on("close", resolve);
      });
    },
  );
}
