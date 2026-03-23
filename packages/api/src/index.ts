import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "./config.js";
import databasePlugin from "./plugins/database.js";
import corsPlugin from "./plugins/cors.js";
import authPlugin from "./plugins/auth.js";
import swaggerPlugin from "./plugins/swagger.js";
import ssePlugin from "./plugins/sse.js";
import { healthRoutes } from "./routes/health.js";
import { projectRoutes } from "./routes/projects.js";
import { authRoutes } from "./routes/auth.js";
import { eventsRoutes } from "./routes/events.js";

/**
 * Builds and configures the Fastify application instance.
 * Exported so that tests can create an isolated instance without binding
 * to a port.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const config = loadConfig();

  const fastify = Fastify({
    logger: true,
  });

  // Plugins — order matters: database must come first so other plugins
  // can access fastify.db, then auth so routes can use fastify.authenticate.
  await fastify.register(databasePlugin, { config });
  await fastify.register(corsPlugin, { config });
  await fastify.register(authPlugin, { config });
  await fastify.register(swaggerPlugin);
  await fastify.register(ssePlugin);

  // Routes — all registered under the /api/v1 prefix via their own path
  // declarations, keeping each route file self-contained.
  await fastify.register(healthRoutes);
  await fastify.register(projectRoutes);
  await fastify.register(authRoutes);
  await fastify.register(eventsRoutes);

  return fastify;
}

/**
 * Starts the HTTP server and registers OS signal handlers for graceful
 * shutdown.
 */
async function start(): Promise<void> {
  const config = loadConfig();
  const fastify = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    fastify.log.info(`Received ${signal} — shutting down gracefully`);
    try {
      await fastify.close();
      fastify.log.info("Server closed");
      process.exit(0);
    } catch (err) {
      fastify.log.error(err, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT", () => { void shutdown("SIGINT"); });

  try {
    await fastify.listen({ port: config.port, host: config.host });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Only start the server when this module is the entry point, not when
// imported by tests.
if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  void start();
}
