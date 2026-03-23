import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/*.test.ts", "packages/*/src/index.ts"],
    },
  },
  optimizeDeps: {
    exclude: ["better-sqlite3"],
  },
});
