export type AgentRole =
  | "product-owner"
  | "scrum-master"
  | "architect"
  | "developer"
  | "qa-engineer"
  | "devops-engineer"
  | "api-guardian";

export type AgentModel =
  | "claude-sonnet-4-20250514"
  | "claude-haiku-35-20241022"
  | "claude-opus-4-20250115";

export interface AgentConfig {
  name: AgentRole;
  displayName: string;
  model: AgentModel;
  description: string;
  tools: string[];
  mcpServers: string[];
  systemPromptPath: string;
}

export interface AgentStatus {
  agentName: AgentRole;
  sessionId: string | null;
  taskId: string | null;
  status: "idle" | "active" | "paused" | "failed";
  driftScore: number;
  tokensUsed: number;
}

export const DEFAULT_AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  "product-owner": {
    name: "product-owner",
    displayName: "Product Owner",
    model: "claude-sonnet-4-20250514",
    description:
      "Manages product backlog, defines user stories, and prioritizes features based on business value.",
    tools: ["Glob", "Grep", "Read", "TodoWrite", "WebSearch"],
    mcpServers: [],
    systemPromptPath: "prompts/product-owner.md",
  },
  "scrum-master": {
    name: "scrum-master",
    displayName: "Scrum Master",
    model: "claude-sonnet-4-20250514",
    description:
      "Orchestrates sprints, monitors agent progress, resolves impediments, and enforces process.",
    tools: ["Glob", "Grep", "Read", "TodoWrite", "Agent", "Bash"],
    mcpServers: [],
    systemPromptPath: "prompts/scrum-master.md",
  },
  architect: {
    name: "architect",
    displayName: "Architect",
    model: "claude-sonnet-4-20250514",
    description:
      "Designs system architecture, defines API contracts, and makes technology decisions.",
    tools: ["Glob", "Grep", "Read", "TodoWrite", "WebSearch"],
    mcpServers: [],
    systemPromptPath: "prompts/architect.md",
  },
  developer: {
    name: "developer",
    displayName: "Developer",
    model: "claude-sonnet-4-20250514",
    description:
      "Implements features, writes code, and follows architectural guidelines and naming conventions.",
    tools: ["Glob", "Grep", "Read", "Write", "Edit", "Bash", "TodoWrite"],
    mcpServers: [],
    systemPromptPath: "prompts/developer.md",
  },
  "qa-engineer": {
    name: "qa-engineer",
    displayName: "QA Engineer",
    model: "claude-haiku-35-20241022",
    description:
      "Writes and runs tests, validates acceptance criteria, and reports quality metrics.",
    tools: ["Glob", "Grep", "Read", "Bash", "TodoWrite", "Write", "Edit"],
    mcpServers: [],
    systemPromptPath: "prompts/qa-engineer.md",
  },
  "devops-engineer": {
    name: "devops-engineer",
    displayName: "DevOps Engineer",
    model: "claude-haiku-35-20241022",
    description:
      "Manages build pipelines, deployment configurations, and infrastructure-as-code.",
    tools: ["Glob", "Grep", "Read", "Bash", "Write", "Edit", "TodoWrite"],
    mcpServers: [],
    systemPromptPath: "prompts/devops-engineer.md",
  },
  "api-guardian": {
    name: "api-guardian",
    displayName: "API Guardian",
    model: "claude-haiku-35-20241022",
    description:
      "Monitors API contract consistency, detects breaking changes, and enforces schema compliance.",
    tools: ["Glob", "Grep", "Read", "TodoWrite", "Bash"],
    mcpServers: [],
    systemPromptPath: "prompts/api-guardian.md",
  },
};
