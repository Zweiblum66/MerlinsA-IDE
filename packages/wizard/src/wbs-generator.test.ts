import { describe, it, expect } from "vitest";
import { WbsGenerator } from "./wbs-generator.js";
import type { ProjectVision, ScopeDefinition, TechStackChoice } from "./prompts.js";

describe("WbsGenerator", () => {
  const generator = new WbsGenerator();

  const vision: ProjectVision = {
    whatBuilding: "Task Management App",
    targetUser: "Small teams",
    coreProblem: "Teams struggle to track and prioritize work items efficiently",
  };

  const techStack: TechStackChoice = {
    frontend: "react",
    backend: "node-express",
    database: "postgresql",
    auth: "clerk",
  };

  describe("generateFromScope", () => {
    it("should always include a 'Project Setup' epic", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["User dashboard"],
        niceToHave: [],
        outOfScope: [],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);
      const setupEpic = wbs.epics.find((e) => e.title === "Project Setup");
      expect(setupEpic).toBeDefined();
      expect(setupEpic!.description).toContain("setup");
    });

    it("should create epics from core features", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["User authentication", "Task board", "Notifications"],
        niceToHave: ["Dark mode"],
        outOfScope: ["Mobile app"],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);

      // Should have setup + 3 feature epics
      expect(wbs.epics.length).toBe(4);

      const epicTitles = wbs.epics.map((e) => e.title);
      expect(epicTitles).toContain("Project Setup");
      expect(epicTitles).toContain("User authentication");
      expect(epicTitles).toContain("Task board");
      expect(epicTitles).toContain("Notifications");
    });

    it("should not create epics for nice-to-have or out-of-scope features", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["Dashboard"],
        niceToHave: ["Analytics"],
        outOfScope: ["Mobile app"],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);
      const epicTitles = wbs.epics.map((e) => e.title);
      expect(epicTitles).not.toContain("Analytics");
      expect(epicTitles).not.toContain("Mobile app");
    });

    it("should assign tasks to appropriate agents", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["User management"],
        niceToHave: [],
        outOfScope: [],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);

      // Setup epic should have devops tasks
      const setupEpic = wbs.epics.find((e) => e.title === "Project Setup");
      expect(setupEpic).toBeDefined();
      const setupTasks = setupEpic!.stories.flatMap((s) => s.tasks);
      const devopsTasks = setupTasks.filter((t) => t.suggestedAgent === "devops");
      expect(devopsTasks.length).toBeGreaterThan(0);

      // Feature epic should have developer and qa tasks
      const featureEpic = wbs.epics.find((e) => e.title === "User management");
      expect(featureEpic).toBeDefined();
      const featureTasks = featureEpic!.stories.flatMap((s) => s.tasks);
      const developerTasks = featureTasks.filter((t) => t.suggestedAgent === "developer");
      const qaTasks = featureTasks.filter((t) => t.suggestedAgent === "qa");
      expect(developerTasks.length).toBeGreaterThan(0);
      expect(qaTasks.length).toBeGreaterThan(0);
    });

    it("should include database setup story when database is not 'none'", () => {
      const scope: ScopeDefinition = {
        coreFeatures: [],
        niceToHave: [],
        outOfScope: [],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);
      const setupEpic = wbs.epics.find((e) => e.title === "Project Setup");
      const dbStory = setupEpic!.stories.find((s) => s.title.includes("Database"));
      expect(dbStory).toBeDefined();
    });

    it("should not include database setup story when database is 'none'", () => {
      const noDatabaseStack: TechStackChoice = {
        frontend: "react",
        backend: "node-express",
        database: "none",
        auth: "none",
      };

      const scope: ScopeDefinition = {
        coreFeatures: [],
        niceToHave: [],
        outOfScope: [],
      };

      const wbs = generator.generateFromScope(vision, scope, noDatabaseStack);
      const setupEpic = wbs.epics.find((e) => e.title === "Project Setup");
      const dbStory = setupEpic!.stories.find((s) => s.title.includes("Database"));
      expect(dbStory).toBeUndefined();
    });

    it("should include auth setup story when auth is not 'none'", () => {
      const scope: ScopeDefinition = {
        coreFeatures: [],
        niceToHave: [],
        outOfScope: [],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);
      const setupEpic = wbs.epics.find((e) => e.title === "Project Setup");
      const authStory = setupEpic!.stories.find((s) => s.title.includes("Authentication"));
      expect(authStory).toBeDefined();
    });

    it("should include testing stories for each feature epic", () => {
      const scope: ScopeDefinition = {
        coreFeatures: ["Search"],
        niceToHave: [],
        outOfScope: [],
      };

      const wbs = generator.generateFromScope(vision, scope, techStack);
      const featureEpic = wbs.epics.find((e) => e.title === "Search");
      expect(featureEpic).toBeDefined();
      const testingStory = featureEpic!.stories.find((s) => s.title.includes("Testing"));
      expect(testingStory).toBeDefined();
    });
  });
});
