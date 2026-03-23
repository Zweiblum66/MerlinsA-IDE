import { describe, it, expect } from "vitest";
import { RiskAssessor } from "./risk-assessor.js";
import type {
  ProjectVision,
  ScopeDefinition,
  TechStackChoice,
  ArchitectureChoice,
} from "./prompts.js";

describe("RiskAssessor", () => {
  const assessor = new RiskAssessor();

  const defaultVision: ProjectVision = {
    whatBuilding: "Task Manager",
    targetUser: "Developers",
    coreProblem: "Teams need a better way to organize and track their development tasks across sprints",
  };

  const simpleTechStack: TechStackChoice = {
    frontend: "react",
    backend: "node-express",
    database: "postgresql",
    auth: "none",
  };

  describe("scope risks", () => {
    it("should detect scope risk when there are many features (>= 10)", () => {
      const scope: ScopeDefinition = {
        coreFeatures: [
          "Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5",
          "Feature 6", "Feature 7", "Feature 8", "Feature 9", "Feature 10",
        ],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "monolith");
      const scopeRisks = assessment.risks.filter((r) => r.category === "scope");
      expect(scopeRisks.length).toBeGreaterThan(0);
      expect(scopeRisks.some((r) => r.impact === "high")).toBe(true);
    });

    it("should detect moderate scope risk when features are between 5 and 9", () => {
      const scope: ScopeDefinition = {
        coreFeatures: [
          "Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5",
          "Feature 6", "Feature 7",
        ],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "monolith");
      const scopeRisks = assessment.risks.filter((r) => r.category === "scope");
      expect(scopeRisks.length).toBeGreaterThan(0);
      expect(scopeRisks.some((r) => r.impact === "medium")).toBe(true);
    });
  });

  describe("complexity risks", () => {
    it("should detect complexity risk for microservices architecture", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["Dashboard"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "microservices");
      const complexityRisks = assessment.risks.filter((r) => r.category === "complexity");
      expect(complexityRisks.length).toBeGreaterThan(0);
      expect(complexityRisks.some((r) => r.impact === "high")).toBe(true);
    });

    it("should detect complexity risk for features involving real-time", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["Real-time chat"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "monolith");
      const complexityRisks = assessment.risks.filter((r) => r.category === "complexity");
      expect(complexityRisks.length).toBeGreaterThan(0);
    });

    it("should detect complexity risk for payment features", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["Payment processing"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "monolith");
      const complexityRisks = assessment.risks.filter((r) => r.category === "complexity");
      expect(complexityRisks.length).toBeGreaterThan(0);
    });
  });

  describe("overall risk level", () => {
    it("should return 'low' overall risk for simple projects", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["Dashboard", "Settings"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "monolith");
      expect(assessment.overallRiskLevel).toBe("low");
    });

    it("should return 'high' overall risk for complex projects with many risk factors", () => {
      const scope: ScopeDefinition = {
        coreFeatures: [
          "Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5",
          "Feature 6", "Feature 7", "Feature 8", "Feature 9", "Feature 10",
          "Real-time collaboration", "Payment processing",
        ],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "microservices");
      expect(assessment.overallRiskLevel).toBe("high");
    });
  });

  describe("technical risks", () => {
    it("should detect risk when using unfamiliar technology", () => {
      const riskyStack: TechStackChoice = {
        frontend: "svelte",
        backend: "rust-axum",
        database: "postgresql",
        auth: "none",
      };

      const scope: ScopeDefinition = {
        coreFeatures: ["Dashboard"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, riskyStack, "monolith");
      const techRisks = assessment.risks.filter((r) => r.category === "technical");
      expect(techRisks.length).toBeGreaterThan(0);
    });

    it("should detect serverless architecture risk", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["API endpoint"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, simpleTechStack, "serverless");
      const techRisks = assessment.risks.filter((r) => r.category === "technical");
      expect(techRisks.length).toBeGreaterThan(0);
    });
  });

  describe("dependency risks", () => {
    it("should detect dependency risk for external auth providers", () => {
      const authStack: TechStackChoice = {
        frontend: "react",
        backend: "node-express",
        database: "postgresql",
        auth: "auth0",
      };

      const scope: ScopeDefinition = {
        coreFeatures: ["Login"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(defaultVision, scope, authStack, "monolith");
      const depRisks = assessment.risks.filter((r) => r.category === "dependency");
      expect(depRisks.length).toBeGreaterThan(0);
    });
  });

  describe("vision risks", () => {
    it("should detect risk when core problem statement is very brief", () => {
      const briefVision: ProjectVision = {
        whatBuilding: "App",
        targetUser: "Users",
        coreProblem: "Needs improvement",
      };

      const scope: ScopeDefinition = {
        coreFeatures: ["Dashboard"],
        niceToHave: [],
        outOfScope: [],
      };

      const assessment = assessor.assessRisks(briefVision, scope, simpleTechStack, "monolith");
      const scopeRisks = assessment.risks.filter((r) => r.category === "scope");
      expect(scopeRisks.length).toBeGreaterThan(0);
    });
  });
});
