// ─── 8-Step Project Wizard Flow ─────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import type { TheIdeDatabase } from "@the-ide/db";
import {
  type ProjectVision,
  type ScopeDefinition,
  type TechStackChoice,
  type ArchitectureChoice,
  type SprintConfig,
  TECH_STACK_OPTIONS,
} from "./prompts.js";
import { WbsGenerator, type WorkBreakdown, type WbsEpic, type WbsStory } from "./wbs-generator.js";
import { RiskAssessor, type RiskAssessment, type Risk } from "./risk-assessor.js";
import {
  projects,
  sprints,
  epics,
  userStories,
  tasks,
} from "@the-ide/db";

// ─── Result Types ───────────────────────────────────────────────

export interface WizardResult {
  projectId: string;
  sprintCount: number;
  totalStories: number;
  totalTasks: number;
  risks: RiskAssessment;
}

interface SprintAllocation {
  sprintNumber: number;
  stories: WbsStory[];
  totalPoints: number;
}

// ─── Wizard State ───────────────────────────────────────────────

interface WizardState {
  vision?: ProjectVision;
  scope?: ScopeDefinition;
  techStack?: TechStackChoice;
  architecture?: ArchitectureChoice;
  workBreakdown?: WorkBreakdown;
  sprintAllocations?: SprintAllocation[];
  riskAssessment?: RiskAssessment;
  sprintConfig?: SprintConfig;
}

// ─── Project Wizard Class ───────────────────────────────────────

export class ProjectWizard {
  private readonly db: TheIdeDatabase;
  private readonly wbsGenerator: WbsGenerator;
  private readonly riskAssessor: RiskAssessor;
  private state: WizardState;

  constructor(db: TheIdeDatabase) {
    this.db = db;
    this.wbsGenerator = new WbsGenerator();
    this.riskAssessor = new RiskAssessor();
    this.state = {};
  }

  // ─── Step 1: Vision ─────────────────────────────────────────

  step1Vision(input: ProjectVision): ProjectVision {
    this.state.vision = input;
    return input;
  }

  // ─── Step 2: Scope ──────────────────────────────────────────

  step2Scope(scope: ScopeDefinition): ScopeDefinition {
    if (!this.state.vision) {
      throw new Error("Vision must be defined before scope (step 1 required)");
    }
    this.state.scope = scope;
    return scope;
  }

  // ─── Step 3: Tech Stack ─────────────────────────────────────

  step3TechStack(choice: TechStackChoice): TechStackChoice {
    // Validate choices against available options
    const frontendOptions = TECH_STACK_OPTIONS.frontend as readonly string[];
    const backendOptions = TECH_STACK_OPTIONS.backend as readonly string[];
    const databaseOptions = TECH_STACK_OPTIONS.database as readonly string[];
    const authOptions = TECH_STACK_OPTIONS.auth as readonly string[];

    if (!frontendOptions.includes(choice.frontend)) {
      throw new Error(
        `Invalid frontend choice: ${choice.frontend}. Options: ${frontendOptions.join(", ")}`,
      );
    }
    if (!backendOptions.includes(choice.backend)) {
      throw new Error(
        `Invalid backend choice: ${choice.backend}. Options: ${backendOptions.join(", ")}`,
      );
    }
    if (!databaseOptions.includes(choice.database)) {
      throw new Error(
        `Invalid database choice: ${choice.database}. Options: ${databaseOptions.join(", ")}`,
      );
    }
    if (!authOptions.includes(choice.auth)) {
      throw new Error(
        `Invalid auth choice: ${choice.auth}. Options: ${authOptions.join(", ")}`,
      );
    }

    this.state.techStack = choice;
    return choice;
  }

  // ─── Step 4: Architecture ───────────────────────────────────

  step4Architecture(choice: ArchitectureChoice): ArchitectureChoice {
    this.state.architecture = choice;
    return choice;
  }

  // ─── Step 5: Work Breakdown ─────────────────────────────────

  step5WorkBreakdown(): WorkBreakdown {
    if (!this.state.vision || !this.state.scope || !this.state.techStack) {
      throw new Error(
        "Vision, scope, and tech stack must be defined before work breakdown (steps 1-3 required)",
      );
    }

    const workBreakdown = this.wbsGenerator.generateFromScope(
      this.state.vision,
      this.state.scope,
      this.state.techStack,
    );

    this.state.workBreakdown = workBreakdown;
    return workBreakdown;
  }

  // ─── Step 6: Sprint Planning ────────────────────────────────

  step6SprintPlanning(config: SprintConfig): SprintAllocation[] {
    if (!this.state.workBreakdown) {
      throw new Error(
        "Work breakdown must be generated before sprint planning (step 5 required)",
      );
    }

    this.state.sprintConfig = config;

    // Collect all stories from all epics
    const allStories: WbsStory[] = this.state.workBreakdown.epics.flatMap(
      (epic) => epic.stories,
    );

    // Allocate stories to sprints based on velocity
    const allocations: SprintAllocation[] = [];
    let currentSprint: SprintAllocation = {
      sprintNumber: 1,
      stories: [],
      totalPoints: 0,
    };

    for (const story of allStories) {
      if (currentSprint.totalPoints + story.storyPoints > config.velocity) {
        // Current sprint is full, start a new one
        if (currentSprint.stories.length > 0) {
          allocations.push(currentSprint);
        }
        currentSprint = {
          sprintNumber: allocations.length + 2,
          stories: [],
          totalPoints: 0,
        };
      }

      currentSprint.stories.push(story);
      currentSprint.totalPoints += story.storyPoints;
    }

    // Push the last sprint if it has stories
    if (currentSprint.stories.length > 0) {
      allocations.push(currentSprint);
    }

    this.state.sprintAllocations = allocations;
    return allocations;
  }

  // ─── Step 7: Risk Assessment ────────────────────────────────

  step7RiskAssessment(): RiskAssessment {
    if (
      !this.state.vision ||
      !this.state.scope ||
      !this.state.techStack ||
      !this.state.architecture
    ) {
      throw new Error(
        "Vision, scope, tech stack, and architecture must be defined before risk assessment (steps 1-4 required)",
      );
    }

    const riskAssessment = this.riskAssessor.assessRisks(
      this.state.vision,
      this.state.scope,
      this.state.techStack,
      this.state.architecture,
    );

    this.state.riskAssessment = riskAssessment;
    return riskAssessment;
  }

  // ─── Step 8: Project Generation ─────────────────────────────

  async step8ProjectGeneration(rootPath: string): Promise<WizardResult> {
    if (
      !this.state.vision ||
      !this.state.scope ||
      !this.state.techStack ||
      !this.state.architecture ||
      !this.state.workBreakdown ||
      !this.state.sprintAllocations ||
      !this.state.riskAssessment
    ) {
      throw new Error(
        "All previous steps must be completed before project generation (steps 1-7 required)",
      );
    }

    const now = new Date();
    const projectId = uuidv4();

    // Create project record
    await this.db.insert(projects).values({
      id: projectId,
      name: this.state.vision.whatBuilding,
      description: this.state.vision.coreProblem,
      rootPath,
      techStack: JSON.stringify(this.state.techStack),
      createdAt: now,
      updatedAt: now,
    });

    let totalStories = 0;
    let totalTasks = 0;

    // Create sprints
    for (const allocation of this.state.sprintAllocations) {
      const sprintId = uuidv4();

      await this.db.insert(sprints).values({
        id: sprintId,
        projectId,
        number: allocation.sprintNumber,
        goal: `Sprint ${allocation.sprintNumber} - ${allocation.totalPoints} story points`,
        status: allocation.sprintNumber === 1 ? "PLANNING" : "PLANNING",
        createdAt: now,
      });

      // Create stories for this sprint (we need to find their parent epic)
      for (const story of allocation.stories) {
        totalStories++;

        // Find or create the epic for this story
        const parentEpic = this.state.workBreakdown!.epics.find((e) =>
          e.stories.includes(story),
        );

        let epicId = uuidv4();

        if (parentEpic) {
          // Check if we already created this epic (use title as key)
          const existingEpic = await this.findEpicByTitle(
            projectId,
            parentEpic.title,
          );

          if (existingEpic) {
            epicId = existingEpic;
          } else {
            await this.db.insert(epics).values({
              id: epicId,
              projectId,
              title: parentEpic.title,
              description: parentEpic.description,
              priority: 0,
              status: "BACKLOG",
              createdAt: now,
            });
            this.epicCache.set(
              `${projectId}:${parentEpic.title}`,
              epicId,
            );
          }
        }

        const storyId = uuidv4();

        await this.db.insert(userStories).values({
          id: storyId,
          epicId,
          sprintId,
          title: story.title,
          description: story.description,
          acceptanceCriteria: JSON.stringify(story.acceptanceCriteria),
          storyPoints: story.storyPoints,
          priority: 0,
          status: "BACKLOG",
          createdAt: now,
        });

        // Create tasks for this story
        for (const task of story.tasks) {
          totalTasks++;
          const taskId = uuidv4();

          await this.db.insert(tasks).values({
            id: taskId,
            userStoryId: storyId,
            title: task.title,
            description: task.description,
            assignedAgent: task.suggestedAgent,
            status: "TODO",
            createdAt: now,
          });
        }
      }
    }

    return {
      projectId,
      sprintCount: this.state.sprintAllocations.length,
      totalStories,
      totalTasks,
      risks: this.state.riskAssessment,
    };
  }

  // ─── Full Run ───────────────────────────────────────────────

  async run(
    vision: ProjectVision,
    scope: ScopeDefinition,
    techStack: TechStackChoice,
    architecture: ArchitectureChoice,
    sprintConfig: SprintConfig,
    rootPath: string,
  ): Promise<WizardResult> {
    this.step1Vision(vision);
    this.step2Scope(scope);
    this.step3TechStack(techStack);
    this.step4Architecture(architecture);
    this.step5WorkBreakdown();
    this.step6SprintPlanning(sprintConfig);
    this.step7RiskAssessment();
    return this.step8ProjectGeneration(rootPath);
  }

  // ─── Helpers ────────────────────────────────────────────────

  private epicCache = new Map<string, string>();

  private async findEpicByTitle(
    projectId: string,
    title: string,
  ): Promise<string | null> {
    const cacheKey = `${projectId}:${title}`;
    return this.epicCache.get(cacheKey) ?? null;
  }
}
