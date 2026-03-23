import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { createDatabase, initializeDatabase } from "@the-ide/db";
import type { ServerConfig } from "../config.js";

declare module "fastify" {
  interface FastifyInstance {
    config: ServerConfig;
  }
}

/**
 * Fastify plugin that initialises the SQLite database and decorates
 * the instance with a `db` property.
 */
const databasePlugin: FastifyPluginAsync<{ config: ServerConfig }> = async (
  fastify,
  opts,
) => {
  const dbPath = opts.config.dbPath || undefined;
  const db = createDatabase(dbPath);
  initializeDatabase(db);
  fastify.decorate("db", db);
  fastify.decorate("config", opts.config);
};

export default fp(databasePlugin, {
  name: "database",
});
