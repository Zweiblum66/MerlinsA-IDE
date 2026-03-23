import type { TheIdeDatabase } from "@the-ide/db";
import type { SseEventBus } from "../services/event-bus.js";

declare module "fastify" {
  interface FastifyInstance {
    db: TheIdeDatabase;
    eventBus: SseEventBus;
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}
