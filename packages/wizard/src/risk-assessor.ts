// ─── Risk Assessment ────────────────────────────────────────────

import type {
  ProjectVision,
  ScopeDefinition,
  TechStackChoice,
  ArchitectureChoice,
} from "./prompts.js";

export interface Risk {
  category: "technical" | "dependency" | "complexity" | "scope";
  description: string;
  impact: "low" | "medium" | "high";
  likelihood: "low" | "medium" | "high";
  mitigation: string;
}

export interface RiskAssessment {
  risks: Risk[];
  overallRiskLevel: "low" | "medium" | "high";
}

// ─── Thresholds ─────────────────────────────────────────────────

const SCOPE_FEATURE_THRESHOLD_MEDIUM = 5;
const SCOPE_FEATURE_THRESHOLD_HIGH = 10;

const NEW_TECH_KEYWORDS = [
  "rust",
  "go",
  "elixir",
  "haskell",
  "kotlin",
  "svelte",
  "solid",
  "astro",
  "bun",
  "deno",
];

const EXTERNAL_AUTH_PROVIDERS = [
  "auth0",
  "clerk",
  "firebase-auth",
  "supabase-auth",
  "next-auth",
  "okta",
];

const COMPLEX_FEATURE_KEYWORDS = [
  "real-time",
  "realtime",
  "websocket",
  "streaming",
  "payment",
  "billing",
  "subscription",
  "machine learning",
  "ml",
  "ai",
  "blockchain",
  "encryption",
  "multi-tenant",
];

// ─── Risk Detection Heuristics ──────────────────────────────────

function assessScopeRisks(scope: ScopeDefinition): Risk[] {
  const risks: Risk[] = [];
  const featureCount = scope.coreFeatures.length;

  if (featureCount >= SCOPE_FEATURE_THRESHOLD_HIGH) {
    risks.push({
      category: "scope",
      description: `Large feature set with ${featureCount} core features increases risk of scope creep and delayed delivery`,
      impact: "high",
      likelihood: "high",
      mitigation:
        "Prioritize features using MoSCoW method. Implement MVP with top 3-5 features first, then iterate.",
    });
  } else if (featureCount >= SCOPE_FEATURE_THRESHOLD_MEDIUM) {
    risks.push({
      category: "scope",
      description: `Moderate feature set with ${featureCount} core features may lead to scope challenges`,
      impact: "medium",
      likelihood: "medium",
      mitigation:
        "Establish clear feature priorities and define done criteria for each. Review scope at each sprint boundary.",
    });
  }

  // Check for complex features
  for (const feature of scope.coreFeatures) {
    const lower = feature.toLowerCase();
    for (const keyword of COMPLEX_FEATURE_KEYWORDS) {
      if (lower.includes(keyword)) {
        risks.push({
          category: "complexity",
          description: `Feature "${feature}" involves ${keyword} which adds significant implementation complexity`,
          impact: "high",
          likelihood: "medium",
          mitigation: `Spike on ${keyword} implementation early. Consider using established libraries or services. Allocate extra time for testing.`,
        });
        break;
      }
    }
  }

  return risks;
}

function assessArchitectureRisks(architecture: ArchitectureChoice): Risk[] {
  const risks: Risk[] = [];

  if (architecture === "microservices") {
    risks.push({
      category: "complexity",
      description:
        "Microservices architecture introduces distributed system complexity including service discovery, inter-service communication, and data consistency challenges",
      impact: "high",
      likelihood: "high",
      mitigation:
        "Start with a modular monolith and extract services only when clear boundaries emerge. Use established patterns like API gateway and circuit breakers.",
    });
  }

  if (architecture === "serverless") {
    risks.push({
      category: "technical",
      description:
        "Serverless architecture may introduce cold start latency, vendor lock-in, and debugging challenges",
      impact: "medium",
      likelihood: "medium",
      mitigation:
        "Design for cold starts with keep-warm strategies. Use infrastructure-as-code for portability. Set up proper observability from day one.",
    });
  }

  return risks;
}

function assessTechStackRisks(techStack: TechStackChoice): Risk[] {
  const risks: Risk[] = [];

  // Check for new/unfamiliar tech
  const allTech = [
    techStack.frontend,
    techStack.backend,
    techStack.database,
    techStack.auth,
  ];

  for (const tech of allTech) {
    const lower = tech.toLowerCase();
    if (NEW_TECH_KEYWORDS.some((keyword) => lower.includes(keyword))) {
      risks.push({
        category: "technical",
        description: `Using ${tech} may introduce learning curve and ecosystem maturity risks`,
        impact: "medium",
        likelihood: "medium",
        mitigation: `Allocate time for team ramp-up on ${tech}. Identify fallback options. Build a proof-of-concept before committing.`,
      });
    }
  }

  // Check for external auth dependency
  if (EXTERNAL_AUTH_PROVIDERS.some((p) => techStack.auth.toLowerCase().includes(p.toLowerCase()))) {
    risks.push({
      category: "dependency",
      description: `Dependency on external auth provider ${techStack.auth} creates a critical external dependency`,
      impact: "high",
      likelihood: "low",
      mitigation:
        "Abstract authentication behind an interface. Document provider-specific configuration. Have a migration plan for switching providers if needed.",
    });
  }

  // Check for multiple new technologies
  const newTechCount = allTech.filter((tech) =>
    NEW_TECH_KEYWORDS.some((keyword) => tech.toLowerCase().includes(keyword)),
  ).length;

  if (newTechCount >= 2) {
    risks.push({
      category: "technical",
      description: `Using ${newTechCount} unfamiliar technologies simultaneously increases integration risk and learning overhead`,
      impact: "high",
      likelihood: "medium",
      mitigation:
        "Consider adopting new technologies incrementally. Use familiar tech for critical path items and experiment with new tech on isolated components.",
    });
  }

  return risks;
}

function assessVisionRisks(vision: ProjectVision): Risk[] {
  const risks: Risk[] = [];

  // Check for vague problem definition
  if (vision.coreProblem.length < 20) {
    risks.push({
      category: "scope",
      description:
        "The core problem statement is very brief, which may indicate an unclear or under-defined problem space",
      impact: "medium",
      likelihood: "medium",
      mitigation:
        "Conduct user interviews or research to validate the problem. Write detailed user personas and journey maps.",
    });
  }

  return risks;
}

// ─── Overall Risk Calculation ───────────────────────────────────

function calculateOverallRisk(risks: Risk[]): "low" | "medium" | "high" {
  if (risks.length === 0) return "low";

  const riskScore = risks.reduce((score, risk) => {
    const impactValue = risk.impact === "high" ? 3 : risk.impact === "medium" ? 2 : 1;
    const likelihoodValue =
      risk.likelihood === "high" ? 3 : risk.likelihood === "medium" ? 2 : 1;
    return score + impactValue * likelihoodValue;
  }, 0);

  const averageScore = riskScore / risks.length;

  if (averageScore >= 6 || risks.some((r) => r.impact === "high" && r.likelihood === "high")) {
    return "high";
  }
  if (averageScore >= 3) {
    return "medium";
  }
  return "low";
}

// ─── Risk Assessor Class ────────────────────────────────────────

export class RiskAssessor {
  assessRisks(
    vision: ProjectVision,
    scope: ScopeDefinition,
    techStack: TechStackChoice,
    architecture: ArchitectureChoice,
  ): RiskAssessment {
    const risks: Risk[] = [
      ...assessVisionRisks(vision),
      ...assessScopeRisks(scope),
      ...assessArchitectureRisks(architecture),
      ...assessTechStackRisks(techStack),
    ];

    const overallRiskLevel = calculateOverallRisk(risks);

    return {
      risks,
      overallRiskLevel,
    };
  }
}
