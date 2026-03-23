// ─── Project Wizard Prompt Definitions ──────────────────────────

export interface ProjectVision {
  whatBuilding: string;
  targetUser: string;
  coreProblem: string;
}

export interface ScopeDefinition {
  coreFeatures: string[];
  niceToHave: string[];
  outOfScope: string[];
}

export interface TechStackChoice {
  frontend: string;
  backend: string;
  database: string;
  auth: string;
}

export type ArchitectureChoice =
  | "monolith"
  | "frontend-api"
  | "microservices"
  | "serverless";

export interface SprintConfig {
  durationWeeks: number;
  velocity: number;
}

// ─── Tech Stack Options ─────────────────────────────────────────

export const TECH_STACK_OPTIONS = {
  frontend: [
    "react",
    "vue",
    "svelte",
    "next.js",
    "nuxt",
    "angular",
    "solid",
    "astro",
    "none",
  ],
  backend: [
    "node-express",
    "node-fastify",
    "node-hono",
    "python-fastapi",
    "python-django",
    "go-gin",
    "rust-axum",
    "none",
  ],
  database: [
    "postgresql",
    "mysql",
    "sqlite",
    "mongodb",
    "redis",
    "supabase",
    "firebase",
    "none",
  ],
  auth: [
    "clerk",
    "auth0",
    "supabase-auth",
    "firebase-auth",
    "lucia",
    "next-auth",
    "passport",
    "custom",
    "none",
  ],
} as const;

// ─── Architecture Templates ─────────────────────────────────────

export const ARCHITECTURE_TEMPLATES: Record<ArchitectureChoice, string> = {
  monolith:
    "Single deployable unit with tightly coupled frontend and backend. Best for small teams and rapid prototyping.",
  "frontend-api":
    "Separate frontend SPA/SSR application communicating with a dedicated API backend. Standard for most web applications.",
  microservices:
    "Multiple independent services communicating via APIs or message queues. Best for large teams and complex domains.",
  serverless:
    "Cloud functions and managed services with no persistent server infrastructure. Best for event-driven and variable-load applications.",
} as const;
