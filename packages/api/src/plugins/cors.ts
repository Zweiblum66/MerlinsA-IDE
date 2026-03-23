import fp from "fastify-plugin";
import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import type { ServerConfig } from "../config.js";

/**
 * Fastify plugin that configures CORS with origins from config.
 */
const corsPlugin: FastifyPluginAsync<{ config: ServerConfig }> = async (
  fastify,
  opts,
) => {
  await fastify.register(cors, {
    origin: opts.config.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  });
};

export default fp(corsPlugin, {
  name: "cors",
});
