// ─── Work Breakdown Structure Generator ─────────────────────────

import type { ProjectVision, ScopeDefinition, TechStackChoice } from "./prompts.js";

export interface WbsTask {
  title: string;
  description: string;
  suggestedAgent: string;
  estimatedComplexity: "low" | "medium" | "high";
}

export interface WbsStory {
  title: string;
  description: string;
  acceptanceCriteria: string[];
  storyPoints: number;
  tasks: WbsTask[];
}

export interface WbsEpic {
  title: string;
  description: string;
  stories: WbsStory[];
}

export interface WorkBreakdown {
  epics: WbsEpic[];
}

// ─── Agent Assignment Mapping ───────────────────────────────────

const TASK_AGENT_MAP: Record<string, string> = {
  setup: "devops",
  infrastructure: "devops",
  deployment: "devops",
  ci: "devops",
  cd: "devops",
  pipeline: "devops",
  docker: "devops",
  database: "developer",
  schema: "developer",
  api: "developer",
  endpoint: "developer",
  service: "developer",
  model: "developer",
  controller: "developer",
  middleware: "developer",
  component: "developer",
  page: "developer",
  layout: "developer",
  style: "developer",
  ui: "developer",
  form: "developer",
  navigation: "developer",
  test: "qa",
  testing: "qa",
  e2e: "qa",
  integration: "qa",
  unit: "qa",
  validation: "qa",
  security: "qa",
};

function assignAgent(taskTitle: string): string {
  const lower = taskTitle.toLowerCase();
  for (const [keyword, agent] of Object.entries(TASK_AGENT_MAP)) {
    if (lower.includes(keyword)) {
      return agent;
    }
  }
  return "developer";
}

function estimateComplexity(description: string): "low" | "medium" | "high" {
  const lower = description.toLowerCase();
  const highComplexityTerms = [
    "authentication",
    "authorization",
    "real-time",
    "websocket",
    "migration",
    "integration",
    "security",
    "encryption",
    "payment",
  ];
  const mediumComplexityTerms = [
    "api",
    "database",
    "crud",
    "form",
    "validation",
    "search",
    "filter",
    "pagination",
  ];

  if (highComplexityTerms.some((term) => lower.includes(term))) return "high";
  if (mediumComplexityTerms.some((term) => lower.includes(term))) return "medium";
  return "low";
}

// ─── Setup Epic Template ────────────────────────────────────────

function createSetupEpic(techStack: TechStackChoice): WbsEpic {
  const stories: WbsStory[] = [
    {
      title: "Repository and project initialization",
      description: "Set up the project repository with proper structure and tooling",
      acceptanceCriteria: [
        "Repository is initialized with Git",
        "Package manager is configured",
        "TypeScript is configured with strict mode",
        "ESLint and Prettier are configured",
        "Project structure follows conventions",
      ],
      storyPoints: 3,
      tasks: [
        {
          title: "Initialize repository and package.json",
          description: "Create the repository with initial package configuration",
          suggestedAgent: "devops",
          estimatedComplexity: "low",
        },
        {
          title: "Configure TypeScript and build tooling",
          description: "Set up tsconfig.json, build scripts, and development tools",
          suggestedAgent: "devops",
          estimatedComplexity: "low",
        },
        {
          title: "Set up linting and formatting",
          description: "Configure ESLint with naming conventions and Prettier",
          suggestedAgent: "devops",
          estimatedComplexity: "low",
        },
      ],
    },
    {
      title: "Development environment setup",
      description: "Configure local development environment and CI pipeline",
      acceptanceCriteria: [
        "Local development server runs successfully",
        "Hot reload is working",
        "Environment variables are documented",
        "CI pipeline runs on push",
      ],
      storyPoints: 5,
      tasks: [
        {
          title: "Configure development server and hot reload",
          description: "Set up dev server with watch mode and hot module replacement",
          suggestedAgent: "devops",
          estimatedComplexity: "medium",
        },
        {
          title: "Set up CI/CD pipeline",
          description: "Configure automated build, test, and deployment pipeline",
          suggestedAgent: "devops",
          estimatedComplexity: "medium",
        },
      ],
    },
  ];

  // Add database setup story if applicable
  if (techStack.database !== "none") {
    stories.push({
      title: "Database setup and initial schema",
      description: `Set up ${techStack.database} with initial schema and migrations`,
      acceptanceCriteria: [
        "Database is provisioned and accessible",
        "Initial schema is created",
        "Migration tooling is configured",
        "Seed data script is available",
      ],
      storyPoints: 5,
      tasks: [
        {
          title: `Configure ${techStack.database} connection`,
          description: `Set up database connection, pooling, and configuration for ${techStack.database}`,
          suggestedAgent: "developer",
          estimatedComplexity: "medium",
        },
        {
          title: "Create initial database schema",
          description: "Define and apply the initial database schema with migrations",
          suggestedAgent: "developer",
          estimatedComplexity: "medium",
        },
        {
          title: "Create seed data script",
          description: "Build a script to populate the database with test/development data",
          suggestedAgent: "developer",
          estimatedComplexity: "low",
        },
      ],
    });
  }

  // Add auth setup story if applicable
  if (techStack.auth !== "none") {
    stories.push({
      title: "Authentication setup",
      description: `Integrate ${techStack.auth} for user authentication`,
      acceptanceCriteria: [
        "Users can sign up and log in",
        "Session management is working",
        "Protected routes are enforced",
        "Auth state is accessible throughout the app",
      ],
      storyPoints: 8,
      tasks: [
        {
          title: `Integrate ${techStack.auth} provider`,
          description: `Set up ${techStack.auth} with proper configuration and credentials`,
          suggestedAgent: "developer",
          estimatedComplexity: "high",
        },
        {
          title: "Implement authentication middleware",
          description: "Create middleware for protecting routes and managing sessions",
          suggestedAgent: "developer",
          estimatedComplexity: "high",
        },
        {
          title: "Create login and signup UI",
          description: "Build authentication pages with proper form validation",
          suggestedAgent: "developer",
          estimatedComplexity: "medium",
        },
      ],
    });
  }

  return {
    title: "Project Setup",
    description:
      "Initial project setup including repository, tooling, infrastructure, and authentication",
    stories,
  };
}

// ─── Feature Epic Template ──────────────────────────────────────

function createFeatureEpic(
  featureName: string,
  techStack: TechStackChoice,
): WbsEpic {
  const hasFrontend = techStack.frontend !== "none";
  const hasBackend = techStack.backend !== "none";

  const stories: WbsStory[] = [];

  // Backend story
  if (hasBackend) {
    stories.push({
      title: `${featureName} - API and business logic`,
      description: `Implement backend API endpoints and business logic for ${featureName}`,
      acceptanceCriteria: [
        `API endpoints for ${featureName} are defined and documented`,
        "Business logic is implemented with proper validation",
        "Error handling returns meaningful responses",
        "Unit tests cover core logic",
      ],
      storyPoints: 5,
      tasks: [
        {
          title: `Define ${featureName} API endpoints`,
          description: `Create REST/GraphQL endpoints for ${featureName} operations`,
          suggestedAgent: "developer",
          estimatedComplexity: estimateComplexity(featureName),
        },
        {
          title: `Implement ${featureName} service layer`,
          description: `Build business logic and data access for ${featureName}`,
          suggestedAgent: "developer",
          estimatedComplexity: estimateComplexity(featureName),
        },
        {
          title: `Add input validation for ${featureName}`,
          description: `Implement request validation and sanitization for ${featureName} endpoints`,
          suggestedAgent: "developer",
          estimatedComplexity: "low",
        },
      ],
    });
  }

  // Frontend story
  if (hasFrontend) {
    stories.push({
      title: `${featureName} - UI components`,
      description: `Build the user interface for ${featureName}`,
      acceptanceCriteria: [
        `UI components for ${featureName} are implemented`,
        "Components are responsive and accessible",
        "Loading and error states are handled",
        "User interactions work as expected",
      ],
      storyPoints: 5,
      tasks: [
        {
          title: `Create ${featureName} page/view component`,
          description: `Build the main page component for ${featureName}`,
          suggestedAgent: "developer",
          estimatedComplexity: "medium",
        },
        {
          title: `Build ${featureName} form components`,
          description: `Create form inputs and submission logic for ${featureName}`,
          suggestedAgent: "developer",
          estimatedComplexity: "medium",
        },
      ],
    });
  }

  // Testing story
  stories.push({
    title: `${featureName} - Testing`,
    description: `Write tests for ${featureName} functionality`,
    acceptanceCriteria: [
      "Unit tests cover business logic",
      "Integration tests verify API behavior",
      hasFrontend ? "Component tests verify UI behavior" : "CLI tests verify command behavior",
      "Edge cases are tested",
    ],
    storyPoints: 3,
    tasks: [
      {
        title: `Write unit tests for ${featureName}`,
        description: `Create unit tests for ${featureName} business logic and utilities`,
        suggestedAgent: "qa",
        estimatedComplexity: "medium",
      },
      {
        title: `Write integration tests for ${featureName}`,
        description: `Create integration tests for ${featureName} API and data flow`,
        suggestedAgent: "qa",
        estimatedComplexity: "medium",
      },
    ],
  });

  return {
    title: featureName,
    description: `Implementation of the ${featureName} feature`,
    stories,
  };
}

// ─── WBS Generator Class ────────────────────────────────────────

export class WbsGenerator {
  generateFromScope(
    vision: ProjectVision,
    scope: ScopeDefinition,
    techStack: TechStackChoice,
  ): WorkBreakdown {
    const epics: WbsEpic[] = [];

    // Always include project setup epic
    epics.push(createSetupEpic(techStack));

    // Map each core feature to an epic
    for (const feature of scope.coreFeatures) {
      epics.push(createFeatureEpic(feature, techStack));
    }

    return { epics };
  }
}
