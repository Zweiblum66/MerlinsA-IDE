import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyPluginAsync } from "fastify";

/**
 * Fastify plugin that sets up OpenAPI documentation at /docs.
 */
const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "the IDE API",
        description: "REST API for the AI-powered IDE orchestration layer",
        version: "1.0.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  });
};

export default fp(swaggerPlugin, {
  name: "swagger",
});
