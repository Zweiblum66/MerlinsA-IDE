// ─── Project Wizard Package ─────────────────────────────────────

export {
  type ProjectVision,
  type ScopeDefinition,
  type TechStackChoice,
  type ArchitectureChoice,
  type SprintConfig,
  TECH_STACK_OPTIONS,
  ARCHITECTURE_TEMPLATES,
} from "./prompts.js";

export {
  WbsGenerator,
  type WorkBreakdown,
  type WbsEpic,
  type WbsStory,
  type WbsTask,
} from "./wbs-generator.js";

export {
  RiskAssessor,
  type RiskAssessment,
  type Risk,
} from "./risk-assessor.js";

export {
  WEB_APP_TEMPLATE,
  API_SERVICE_TEMPLATE,
  type ProjectTemplate,
} from "./templates/index.js";

export {
  ProjectWizard,
  type WizardResult,
} from "./flow.js";
