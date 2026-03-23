// ─── Naming Convention Package ──────────────────────────────────

export {
  type NamingFormat,
  type NamingRule,
  type ValidationResult,
  validateName,
  DEFAULT_NAMING_RULES,
} from "./rules.js";

export {
  NamingAnalyzer,
  type NamingViolation,
} from "./analyzer.js";

export {
  generateEslintConfig,
} from "./eslint-config.js";

export {
  createNamingServer,
  type NamingTool,
} from "./server.js";
