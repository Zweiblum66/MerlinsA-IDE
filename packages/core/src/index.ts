// Types
export type {
  AgentRole,
  AgentModel,
  AgentConfig,
  AgentStatus,
} from "./types/agent.js";
export { DEFAULT_AGENT_CONFIGS } from "./types/agent.js";

export type {
  GoalContext,
  TaskAssignment,
  TaskResult,
} from "./types/task.js";

export type {
  OrchestratorEvent,
  EventHandler,
  EventBus,
} from "./types/events.js";

// Core classes
export { GoalTracker } from "./goal-tracker.js";
export { AgentManager } from "./agent-manager.js";
export { SessionManager } from "./session-manager.js";
export type { TokenUsageInput } from "./session-manager.js";
export { Orchestrator } from "./orchestrator.js";
export { AgentRunner } from "./agent-runner.js";
export type { AgentRunnerOptions } from "./agent-runner.js";
export { ToolRegistry } from "./tool-registry.js";
export type { RegisteredTool, McpTool } from "./tool-registry.js";

// Context provider
export { ContextProvider } from "./context-provider.js";
export type { ContextProviderConfig, TaskContext } from "./context-provider.js";

// Hooks
export { createPreToolUseHook } from "./hooks/pre-tool-use.js";
export type { PreToolUseResult, NamingChecker } from "./hooks/pre-tool-use.js";
export {
  createPostToolUseHook,
  createFilesModifiedTracker,
} from "./hooks/post-tool-use.js";
export { createPreCompactHook } from "./hooks/pre-compact.js";
