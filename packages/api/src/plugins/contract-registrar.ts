import { ApiContractRegistry } from "@the-ide/api-registry";
import type { FastifyInstance, RouteOptions } from "fastify";
import type { TheIdeDatabase } from "@the-ide/db";

/**
 * Registers a route with Fastify and simultaneously records it in
 * the ApiContractRegistry so that contract drift can be detected.
 *
 * @param fastify  - The Fastify instance to register the route on.
 * @param db       - Database instance used by the registry.
 * @param projectId - Project that owns this contract.
 * @param route    - Standard Fastify route options.
 * @param description - Human-readable description for the contract.
 */
export async function registerRoute(
  fastify: FastifyInstance,
  db: TheIdeDatabase,
  projectId: string,
  route: RouteOptions,
  description: string,
): Promise<void> {
  fastify.route(route);

  const registry = new ApiContractRegistry(db, projectId);

  const method = Array.isArray(route.method)
    ? (route.method[0] as "GET" | "POST" | "PUT" | "DELETE" | "PATCH")
    : (route.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH");

  const requestSchema = route.schema?.body
    ? JSON.stringify(route.schema.body)
    : "{}";

  const responseSchema = route.schema?.response
    ? JSON.stringify(route.schema.response)
    : "{}";

  try {
    const existing = await registry.getContractByRoute(route.url, method);
    if (!existing) {
      await registry.registerEndpoint(
        route.url,
        method,
        requestSchema,
        responseSchema,
        description,
      );
    }
  } catch {
    // Non-fatal: contract registration failure should not block startup.
    fastify.log.warn(
      `Failed to register API contract for ${method} ${route.url}`,
    );
  }
}
