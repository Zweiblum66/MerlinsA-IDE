import { describe, it, expect } from "vitest";
import { SyncChecker } from "./sync-checker.js";

describe("SyncChecker", () => {
  const checker = new SyncChecker();

  describe("extractRouteDefinitions", () => {
    it("should parse Express app.get(\"/path\") patterns", () => {
      const content = `
app.get("/api/users", (req, res) => {
  res.json([]);
});
`;
      const routes = checker.extractRouteDefinitions(content, "express", "routes.ts");
      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe("/api/users");
      expect(routes[0].method).toBe("GET");
      expect(routes[0].filePath).toBe("routes.ts");
      expect(routes[0].line).toBe(2);
    });

    it("should parse Express router.post(\"/path\") patterns", () => {
      const content = `
router.post("/api/users", (req, res) => {
  res.status(201).json({});
});
`;
      const routes = checker.extractRouteDefinitions(content, "express", "users.ts");
      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe("/api/users");
      expect(routes[0].method).toBe("POST");
      expect(routes[0].filePath).toBe("users.ts");
    });

    it("should parse multiple routes from the same file", () => {
      const content = `
app.get("/api/users", handler1);
app.post("/api/users", handler2);
app.delete("/api/users/:id", handler3);
`;
      const routes = checker.extractRouteDefinitions(content, "express", "app.ts");
      expect(routes).toHaveLength(3);
      expect(routes[0].method).toBe("GET");
      expect(routes[1].method).toBe("POST");
      expect(routes[2].method).toBe("DELETE");
      expect(routes[2].path).toBe("/api/users/:id");
    });

    it("should parse Fastify route definitions", () => {
      const content = `
fastify.get("/api/items", async (request, reply) => {
  return { items: [] };
});
`;
      const routes = checker.extractRouteDefinitions(content, "fastify", "server.ts");
      expect(routes).toHaveLength(1);
      expect(routes[0].path).toBe("/api/items");
      expect(routes[0].method).toBe("GET");
    });

    it("should handle routes with single quotes and backticks", () => {
      const content = `
app.get('/api/single', handler);
app.post(\`/api/template\`, handler2);
`;
      const routes = checker.extractRouteDefinitions(content, "express", "app.ts");
      expect(routes).toHaveLength(2);
      expect(routes[0].path).toBe("/api/single");
      expect(routes[1].path).toBe("/api/template");
    });
  });

  describe("extractApiCalls", () => {
    it("should detect fetch(\"/api/...\") patterns", () => {
      const content = `
const response = await fetch("/api/users");
`;
      const calls = checker.extractApiCalls(content, "client.ts");
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe("/api/users");
      expect(calls[0].method).toBe("GET");
      expect(calls[0].filePath).toBe("client.ts");
    });

    it("should detect fetch with method option", () => {
      const content = `
const response = await fetch("/api/users", { method: "POST", body: JSON.stringify(data) });
`;
      const calls = checker.extractApiCalls(content, "client.ts");
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe("/api/users");
      expect(calls[0].method).toBe("POST");
    });

    it("should detect axios.get(\"/api/...\") patterns", () => {
      const content = `
const { data } = await axios.get("/api/products");
`;
      const calls = checker.extractApiCalls(content, "api.ts");
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe("/api/products");
      expect(calls[0].method).toBe("GET");
    });

    it("should detect axios.post(\"/api/...\") patterns", () => {
      const content = `
await axios.post("/api/orders", orderData);
`;
      const calls = checker.extractApiCalls(content, "orders.ts");
      expect(calls).toHaveLength(1);
      expect(calls[0].path).toBe("/api/orders");
      expect(calls[0].method).toBe("POST");
    });

    it("should detect multiple API calls in one file", () => {
      const content = `
const users = await fetch("/api/users");
const products = await axios.get("/api/products");
await axios.delete("/api/cart/123");
`;
      const calls = checker.extractApiCalls(content, "dashboard.ts");
      expect(calls).toHaveLength(3);
      expect(calls[0].path).toBe("/api/users");
      expect(calls[1].path).toBe("/api/products");
      expect(calls[2].path).toBe("/api/cart/123");
    });

    it("should not detect non-API fetch calls", () => {
      const content = `
const response = await fetch("https://external.com/data");
`;
      const calls = checker.extractApiCalls(content, "external.ts");
      expect(calls).toHaveLength(0);
    });
  });
});
