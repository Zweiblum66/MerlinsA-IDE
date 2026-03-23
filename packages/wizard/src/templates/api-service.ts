// ─── API Service Template ───────────────────────────────────────

import type { ProjectTemplate } from "./web-app.js";

export const API_SERVICE_TEMPLATE: ProjectTemplate = {
  name: "api-service",
  description: "Standalone API service with REST endpoints",
  structure: [
    // Root config
    "package.json",
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc",
    ".gitignore",
    "README.md",

    // Source
    "src/",
    "src/index.ts",
    "src/app.ts",

    // Routes
    "src/routes/",
    "src/routes/index.ts",
    "src/routes/health.ts",

    // Middleware
    "src/middleware/",
    "src/middleware/auth.ts",
    "src/middleware/errorHandler.ts",
    "src/middleware/rateLimiter.ts",
    "src/middleware/validation.ts",
    "src/middleware/logging.ts",

    // Services (business logic)
    "src/services/",
    "src/services/index.ts",

    // Data layer
    "src/db/",
    "src/db/schema.ts",
    "src/db/connection.ts",
    "src/db/migrations/",

    // Domain models / types
    "src/models/",
    "src/models/index.ts",
    "src/types/",
    "src/types/index.ts",
    "src/types/api.ts",

    // Config
    "src/config/",
    "src/config/index.ts",
    "src/config/env.ts",

    // Utilities
    "src/utils/",
    "src/utils/logger.ts",
    "src/utils/errors.ts",
    "src/utils/validation.ts",

    // Tests
    "tests/",
    "tests/unit/",
    "tests/integration/",
    "tests/fixtures/",
    "tests/setup.ts",
    "tests/helpers/",
    "tests/helpers/testClient.ts",

    // Scripts and tooling
    "scripts/",
    "scripts/seed.ts",
    "scripts/migrate.ts",
    "scripts/generate-openapi.ts",
    ".env.example",
    "docker-compose.yml",
    "Dockerfile",
    "openapi.yaml",
  ],
  defaultDependencies: {
    frontend: {},
    backend: {
      "hono": "^4.0.0",
      "drizzle-orm": "^0.36.0",
      "better-sqlite3": "^11.0.0",
      "zod": "^3.23.0",
      "jose": "^5.0.0",
      "pino": "^9.0.0",
      "pino-pretty": "^11.0.0",
    },
    shared: {
      "typescript": "^5.6.0",
      "@typescript-eslint/eslint-plugin": "^8.0.0",
      "@typescript-eslint/parser": "^8.0.0",
      "eslint": "^9.0.0",
      "prettier": "^3.3.0",
      "vitest": "^2.0.0",
      "tsup": "^8.0.0",
      "@types/better-sqlite3": "^7.0.0",
    },
  },
  eslintConfig: {
    extends: ["@the-ide/naming"],
    namingConventions: true,
  },
};
