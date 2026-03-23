// ─── Web App Template ───────────────────────────────────────────

export interface ProjectTemplate {
  name: string;
  description: string;
  structure: string[];
  defaultDependencies: {
    frontend: Record<string, string>;
    backend: Record<string, string>;
    shared: Record<string, string>;
  };
  eslintConfig: {
    extends: string[];
    namingConventions: boolean;
  };
}

export const WEB_APP_TEMPLATE: ProjectTemplate = {
  name: "web-app",
  description: "Full-stack web application",
  structure: [
    // Root config
    "package.json",
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc",
    ".gitignore",
    "README.md",

    // Frontend
    "src/client/",
    "src/client/index.tsx",
    "src/client/App.tsx",
    "src/client/routes/",
    "src/client/routes/index.tsx",
    "src/client/components/",
    "src/client/components/layout/",
    "src/client/components/layout/Header.tsx",
    "src/client/components/layout/Footer.tsx",
    "src/client/components/layout/Sidebar.tsx",
    "src/client/components/ui/",
    "src/client/components/ui/Button.tsx",
    "src/client/components/ui/Input.tsx",
    "src/client/components/ui/Card.tsx",
    "src/client/hooks/",
    "src/client/hooks/useAuth.ts",
    "src/client/hooks/useFetch.ts",
    "src/client/stores/",
    "src/client/stores/authStore.ts",
    "src/client/styles/",
    "src/client/styles/globals.css",
    "src/client/lib/",
    "src/client/lib/api.ts",
    "src/client/types/",
    "src/client/types/index.ts",

    // Backend
    "src/server/",
    "src/server/index.ts",
    "src/server/routes/",
    "src/server/routes/index.ts",
    "src/server/routes/auth.ts",
    "src/server/middleware/",
    "src/server/middleware/auth.ts",
    "src/server/middleware/errorHandler.ts",
    "src/server/middleware/validation.ts",
    "src/server/services/",
    "src/server/models/",
    "src/server/db/",
    "src/server/db/schema.ts",
    "src/server/db/migrations/",
    "src/server/config/",
    "src/server/config/index.ts",
    "src/server/types/",
    "src/server/types/index.ts",

    // Shared
    "src/shared/",
    "src/shared/types/",
    "src/shared/types/api.ts",
    "src/shared/constants/",
    "src/shared/utils/",

    // Tests
    "tests/",
    "tests/unit/",
    "tests/integration/",
    "tests/e2e/",
    "tests/fixtures/",
    "tests/setup.ts",

    // Config and tooling
    "scripts/",
    "scripts/seed.ts",
    "scripts/migrate.ts",
    ".env.example",
    "docker-compose.yml",
    "Dockerfile",
  ],
  defaultDependencies: {
    frontend: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
      "react-router": "^7.0.0",
      "@tanstack/react-query": "^5.0.0",
      "tailwindcss": "^4.0.0",
      "lucide-react": "^0.400.0",
      "zod": "^3.23.0",
    },
    backend: {
      "hono": "^4.0.0",
      "drizzle-orm": "^0.36.0",
      "better-sqlite3": "^11.0.0",
      "zod": "^3.23.0",
      "jose": "^5.0.0",
    },
    shared: {
      "typescript": "^5.6.0",
      "@typescript-eslint/eslint-plugin": "^8.0.0",
      "@typescript-eslint/parser": "^8.0.0",
      "eslint": "^9.0.0",
      "prettier": "^3.3.0",
      "vitest": "^2.0.0",
      "tsup": "^8.0.0",
    },
  },
  eslintConfig: {
    extends: ["@the-ide/naming"],
    namingConventions: true,
  },
};
