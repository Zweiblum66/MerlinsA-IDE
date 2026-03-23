import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { SseEventBus } from "../services/event-bus.js";

/**
 * Fastify plugin that creates the SSE event bus and decorates
 * the instance with an `eventBus` property.
 */
const ssePlugin: FastifyPluginAsync = async (fastify) => {
  const eventBus = new SseEventBus();
  fastify.decorate("eventBus", eventBus);
};

export default fp(ssePlugin, {
  name: "sse",
});
