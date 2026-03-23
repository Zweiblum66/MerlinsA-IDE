import type { ApiContractRegistry } from "./registry.js";

export interface RouteDefinition {
  path: string;
  method: string;
  filePath: string;
  line: number;
}

export interface ApiCallSite {
  path: string;
  method: string;
  filePath: string;
  line: number;
}

export interface SyncReport {
  inSync: boolean;
  unmatchedRoutes: RouteDefinition[];
  unmatchedCalls: ApiCallSite[];
  contractMismatches: string[];
}

type Framework = "express" | "fastify";

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;

export class SyncChecker {
  extractRouteDefinitions(
    fileContent: string,
    framework: Framework,
    filePath: string = "",
  ): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    const lines = fileContent.split("\n");

    const prefixes =
      framework === "express"
        ? ["app", "router"]
        : ["fastify"];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const prefix of prefixes) {
        for (const method of HTTP_METHODS) {
          const pattern = new RegExp(
            `${prefix}\\.${method}\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]`,
          );
          const match = line.match(pattern);

          if (match) {
            routes.push({
              path: match[1],
              method: method.toUpperCase(),
              filePath,
              line: i + 1,
            });
          }
        }
      }
    }

    return routes;
  }

  extractApiCalls(
    fileContent: string,
    filePath: string = "",
  ): ApiCallSite[] {
    const calls: ApiCallSite[] = [];
    const lines = fileContent.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Match fetch("/api/...") or fetch('/api/...') or fetch(`/api/...`)
      const fetchMatch = line.match(
        /fetch\s*\(\s*["'`](\/api\/[^"'`]+)["'`]/,
      );
      if (fetchMatch) {
        // Try to detect method from options
        const methodMatch = line.match(/method\s*:\s*["'`](\w+)["'`]/);
        calls.push({
          path: fetchMatch[1],
          method: methodMatch ? methodMatch[1].toUpperCase() : "GET",
          filePath,
          line: i + 1,
        });
      }

      // Match axios.get("/api/..."), axios.post("/api/..."), etc.
      for (const method of HTTP_METHODS) {
        const axiosPattern = new RegExp(
          `axios\\.${method}\\s*\\(\\s*["'\`](\/api\/[^"'\`]+)["'\`]`,
        );
        const axiosMatch = line.match(axiosPattern);
        if (axiosMatch) {
          calls.push({
            path: axiosMatch[1],
            method: method.toUpperCase(),
            filePath,
            line: i + 1,
          });
        }
      }
    }

    return calls;
  }

  async checkSync(
    routes: RouteDefinition[],
    apiCalls: ApiCallSite[],
    registry: ApiContractRegistry,
  ): Promise<SyncReport> {
    const contracts = await registry.listContracts();
    const contractMap = new Map(
      contracts.map((c) => [`${c.method}:${c.path}`, c]),
    );

    const unmatchedRoutes: RouteDefinition[] = [];
    const unmatchedCalls: ApiCallSite[] = [];
    const contractMismatches: string[] = [];

    const matchedRouteKeys = new Set<string>();
    const matchedCallKeys = new Set<string>();

    // Check routes against contracts
    for (const route of routes) {
      const key = `${route.method}:${route.path}`;
      if (contractMap.has(key)) {
        matchedRouteKeys.add(key);
      } else {
        unmatchedRoutes.push(route);
      }
    }

    // Check API calls against contracts
    for (const call of apiCalls) {
      const key = `${call.method}:${call.path}`;
      if (contractMap.has(key)) {
        matchedCallKeys.add(key);
      } else {
        unmatchedCalls.push(call);
      }
    }

    // Check for contracts that have routes but no frontend calls
    const routeKeys = new Set(routes.map((r) => `${r.method}:${r.path}`));
    const callKeys = new Set(apiCalls.map((c) => `${c.method}:${c.path}`));

    for (const route of routes) {
      const key = `${route.method}:${route.path}`;
      if (routeKeys.has(key) && !callKeys.has(key)) {
        contractMismatches.push(
          `Route ${route.method} ${route.path} has no matching frontend call`,
        );
      }
    }

    for (const call of apiCalls) {
      const key = `${call.method}:${call.path}`;
      if (callKeys.has(key) && !routeKeys.has(key)) {
        contractMismatches.push(
          `Frontend call ${call.method} ${call.path} has no matching backend route`,
        );
      }
    }

    return {
      inSync:
        unmatchedRoutes.length === 0 &&
        unmatchedCalls.length === 0 &&
        contractMismatches.length === 0,
      unmatchedRoutes,
      unmatchedCalls,
      contractMismatches,
    };
  }
}
