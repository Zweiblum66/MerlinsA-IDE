type AgentRole =
  | "product-owner"
  | "scrum-master"
  | "architect"
  | "developer"
  | "qa-engineer"
  | "devops-engineer"
  | "api-guardian";

type AgentModel =
  | "claude-sonnet-4-20250514"
  | "claude-haiku-35-20241022"
  | "claude-opus-4-20250115";

export type { AgentRole, AgentModel };

export interface ModelConfig {
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
}

const MODEL_CONFIGS: Record<AgentModel, ModelConfig> = {
  "claude-sonnet-4-20250514": {
    contextWindow: 200_000,
    inputPrice: 3,
    outputPrice: 15,
  },
  "claude-haiku-35-20241022": {
    contextWindow: 200_000,
    inputPrice: 0.8,
    outputPrice: 4,
  },
  "claude-opus-4-20250115": {
    contextWindow: 200_000,
    inputPrice: 15,
    outputPrice: 75,
  },
};

const DEFAULT_AGENT_MODELS: Record<AgentRole, AgentModel> = {
  "product-owner": "claude-sonnet-4-20250514",
  "scrum-master": "claude-haiku-35-20241022",
  "architect": "claude-sonnet-4-20250514",
  "developer": "claude-sonnet-4-20250514",
  "qa-engineer": "claude-haiku-35-20241022",
  "devops-engineer": "claude-haiku-35-20241022",
  "api-guardian": "claude-sonnet-4-20250514",
};

const UPGRADE_PATH: Record<AgentModel, AgentModel> = {
  "claude-haiku-35-20241022": "claude-sonnet-4-20250514",
  "claude-sonnet-4-20250514": "claude-opus-4-20250115",
  "claude-opus-4-20250115": "claude-opus-4-20250115", // Already at max
};

export class ModelRouter {
  getModelForAgent(agentRole: AgentRole): AgentModel {
    return DEFAULT_AGENT_MODELS[agentRole];
  }

  shouldUpgrade(agentRole: AgentRole, failureCount: number): AgentModel {
    const currentModel = DEFAULT_AGENT_MODELS[agentRole];

    if (failureCount > 1) {
      return UPGRADE_PATH[currentModel];
    }

    return currentModel;
  }

  getModelConfig(model: AgentModel): ModelConfig {
    return MODEL_CONFIGS[model];
  }
}
