import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { ServerConfig } from "../config.js";

/**
 * Fastify plugin that sets up JWT authentication.
 * Adds `fastify.authenticate` as a preHandler hook and registers
 * the login route at POST /api/v1/auth/login.
 */
const authPlugin: FastifyPluginAsync<{ config: ServerConfig }> = async (
  fastify,
  opts,
) => {
  await fastify.register(jwt, {
    secret: opts.config.jwtSecret,
  });

  fastify.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.code(401).send({ error: "Unauthorized", message: "Invalid or missing token" });
      }
    },
  );
};

export default fp(authPlugin, {
  name: "auth",
});
