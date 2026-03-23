import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { TheIdeDatabase } from "@the-ide/db";
import type { EventBus } from "./types/events.js";
import type { AgentRole, AgentModel } from "./types/agent.js";
import type { TaskAssignment, TaskResult } from "./types/task.js";
import { SessionManager } from "./session-manager.js";
import { ToolRegistry } from "./tool-registry.js";
import type { McpTool } from "./tool-registry.js";

/** Parsed YAML frontmatter from an agent definition file. */
interface AgentFrontmatter {
  name: string;
  model?: string;
  tools?: string[];
  description?: string;
}

/** Token usage counters for a single API call. */
interface CallTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreation: number;
}

/** Aggregate token counters for the entire runner session. */
interface SessionTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

const DEFAULT_MODEL: AgentModel = "claude-sonnet-4-20250514";

/** Maps shorthand model aliases found in agent frontmatter to canonical model IDs. */
const MODEL_ALIAS_MAP: Record<string, AgentModel> = {
  sonnet: "claude-sonnet-4-20250514",
  haiku: "claude-haiku-35-20241022",
  opus: "claude-opus-4-20250115",
  "claude-sonnet-4-20250514": "claude-sonnet-4-20250514",
  "claude-haiku-35-20241022": "claude-haiku-35-20241022",
  "claude-opus-4-20250115": "claude-opus-4-20250115",
};

/** Maximum number of conversation turns before forcing a stop. */
const MAX_TURNS = 50;

/**
 * Parses YAML frontmatter from a markdown string.
 * Expects the file to start with `---\n...\n---`.
 */
function parseFrontmatter(raw: string): {
  frontmatter: AgentFrontmatter;
  body: string;
} {
  const FENCE = "---";
  const lines = raw.split("\n");

  if (lines[0]?.trim() !== FENCE) {
    return { frontmatter: { name: "unknown" }, body: raw };
  }

  const closingIdx = lines.indexOf(FENCE, 1);
  if (closingIdx === -1) {
    return { frontmatter: { name: "unknown" }, body: raw };
  }

  const fmLines = lines.slice(1, closingIdx);
  const body = lines.slice(closingIdx + 1).join("\n").trimStart();

  const frontmatter: AgentFrontmatter = { name: "unknown" };

  for (const line of fmLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    switch (key) {
      case "name":
      case "model":
      case "description":
        frontmatter[key] = rawValue;
        break;
      case "tools": {
        // Inline YAML list: `tools: [A, B, C]`
        if (rawValue.startsWith("[")) {
          frontmatter.tools = rawValue
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim());
        }
        break;
      }
    }
  }

  // Parse block-style tool list (lines following `tools:`)
  if (!frontmatter.tools) {
    const toolsLineIdx = fmLines.findIndex((l) => l.trim() === "tools:");
    if (toolsLineIdx !== -1) {
      const toolEntries: string[] = [];
      for (let i = toolsLineIdx + 1; i < fmLines.length; i++) {
        const entry = fmLines[i];
        if (entry?.startsWith("  - ") || entry?.startsWith("- ")) {
          toolEntries.push(entry.replace(/^\s*-\s+/, "").trim());
        } else if (!entry?.startsWith(" ")) {
          break;
        }
      }
      if (toolEntries.length > 0) {
        frontmatter.tools = toolEntries;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Resolves a model alias to a canonical AgentModel identifier.
 */
function resolveModel(alias: string | undefined): AgentModel {
  if (!alias) return DEFAULT_MODEL;
  return MODEL_ALIAS_MAP[alias] ?? DEFAULT_MODEL;
}

/**
 * Computes a simple drift score from a list of modified files vs. scope files.
 * Returns a value between 0 and 1 where 0 is no drift and 1 is complete drift.
 */
function computeDriftScore(
  filesModified: string[],
  scopeFiles: string[],
): number {
  if (filesModified.length === 0) return 0;
  if (scopeFiles.length === 0) return 0;

  let inScopeCount = 0;
  for (const file of filesModified) {
    const inScope = scopeFiles.some(
      (s) =>
        file === s ||
        file.endsWith(`/${s}`) ||
        (s.endsWith("*") && file.startsWith(s.slice(0, -1))),
    );
    if (inScope) inScopeCount++;
  }

  const outOfScope = filesModified.length - inScopeCount;
  return outOfScope / filesModified.length;
}

/** Options for constructing an AgentRunner. */
export interface AgentRunnerOptions {
  /** Absolute path to the project root (where `.claude/agents/` lives). */
  projectRoot: string;
  /** Anthropic API key. Falls back to ANTHROPIC_API_KEY env var if omitted. */
  apiKey?: string;
  /** Database instance for recording session/token data. */
  db: TheIdeDatabase;
  /** Event bus for emitting orchestrator events. */
  eventBus: EventBus;
}

/**
 * AgentRunner executes a single agent task by:
 * 1. Loading the agent's system prompt from its `.claude/agents/{role}.md` file.
 * 2. Running a multi-turn conversation loop with the Anthropic API.
 * 3. Handling tool_use blocks by executing registered tools.
 * 4. Tracking token usage and recording it via SessionManager.
 * 5. Emitting lifecycle events on the EventBus.
 */
export class AgentRunner {
  private readonly _projectRoot: string;
  private readonly _client: Anthropic;
  private readonly _db: TheIdeDatabase;
  private readonly _eventBus: EventBus;
  private readonly _sessionManager: SessionManager;
  private readonly _toolRegistry: ToolRegistry;
  private _abortController: AbortController;

  constructor(options: AgentRunnerOptions) {
    this._projectRoot = options.projectRoot;
    this._client = new Anthropic({ apiKey: options.apiKey });
    this._db = options.db;
    this._eventBus = options.eventBus;
    this._sessionManager = new SessionManager();
    this._toolRegistry = new ToolRegistry();
    this._abortController = new AbortController();

    // Register MCP stub tools by default so agents can call them
    this._toolRegistry.registerMcpTools(this._toolRegistry.getMcpToolStubs());
  }

  /**
   * Register additional MCP tools (e.g. from api-registry or naming MCP servers).
   * @param tools - MCP tools to add to the registry.
   */
  registerMcpTools(tools: McpTool[]): void {
    this._toolRegistry.registerMcpTools(tools);
  }

  /**
   * Cancel the currently running task at the next safe point.
   */
  cancel(): void {
    this._abortController.abort();
  }

  /**
   * Load and parse the agent definition file for the given role.
   */
  private async _loadAgentDefinition(role: AgentRole): Promise<{
    systemPrompt: string;
    model: AgentModel;
  }> {
    const agentFilePath = join(
      this._projectRoot,
      ".claude",
      "agents",
      `${role}.md`,
    );

    let raw: string;
    try {
      raw = await readFile(agentFilePath, "utf-8");
    } catch {
      throw new Error(
        `Agent definition not found for role "${role}" at: ${agentFilePath}`,
      );
    }

    const { frontmatter, body } = parseFrontmatter(raw);
    const model = resolveModel(frontmatter.model);

    return { systemPrompt: body, model };
  }

  /**
   * Build the initial user message for a task assignment.
   */
  private _buildInitialMessage(assignment: TaskAssignment): string {
    const { goalContext, prompt } = assignment;

    const sections: string[] = [
      "# Task Assignment",
      "",
      "## Goal",
      goalContext.description,
      "",
    ];

    if (goalContext.acceptanceCriteria.length > 0) {
      sections.push("## Acceptance Criteria");
      for (const [i, criterion] of goalContext.acceptanceCriteria.entries()) {
        sections.push(`${i + 1}. ${criterion}`);
      }
      sections.push("");
    }

    if (goalContext.scopeFiles.length > 0) {
      sections.push("## Scope Files");
      for (const f of goalContext.scopeFiles) {
        sections.push(`- ${f}`);
      }
      sections.push("");
    }

    if (goalContext.scopeKeywords.length > 0) {
      sections.push("## Scope Keywords");
      for (const k of goalContext.scopeKeywords) {
        sections.push(`- ${k}`);
      }
      sections.push("");
    }

    sections.push("## Instructions", prompt, "");

    sections.push(
      "## Important",
      "- Only modify files within the defined scope.",
      "- If you need to modify files outside scope, document the reason.",
      "- Follow the project naming conventions (camelCase for variables/functions, PascalCase for types/interfaces/classes).",
      "- Ensure all changes align with the acceptance criteria.",
      "- When done, provide a concise summary of what was accomplished.",
    );

    return sections.join("\n");
  }

  /**
   * Accumulate token usage from an API response into the session totals.
   */
  private _accumulateUsage(
    sessionUsage: SessionTokenUsage,
    response: Anthropic.Message,
  ): CallTokenUsage {
    const usage = response.usage;
    const callUsage: CallTokenUsage = {
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheRead: (usage as unknown as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
      cacheCreation: (usage as unknown as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
    };

    sessionUsage.input += callUsage.inputTokens;
    sessionUsage.output += callUsage.outputTokens;
    sessionUsage.cacheRead += callUsage.cacheRead;
    sessionUsage.cacheCreation += callUsage.cacheCreation;

    return callUsage;
  }

  /**
   * Run a task assignment to completion and return its result.
   *
   * @param assignment - The task to execute.
   * @returns A TaskResult describing the outcome.
   */
  async run(assignment: TaskAssignment): Promise<TaskResult> {
    // Reset abort controller for this run
    this._abortController = new AbortController();

    const { agentRole, taskId, goalContext } = assignment;

    // Load agent definition — fail early if missing
    let systemPrompt: string;
    let model: AgentModel;
    try {
      const agentDef = await this._loadAgentDefinition(agentRole);
      systemPrompt = agentDef.systemPrompt;
      model = agentDef.model;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        taskId,
        agentRole,
        sessionId: "",
        status: "failed",
        summary: `Task failed: ${errorMessage}`,
        filesModified: [],
        tokensUsed: 0,
        driftScore: 0,
      };
    }

    // Create a session record
    const sessionRecord = await this._sessionManager.createSession(
      agentRole,
      taskId,
      null,
      model,
      this._db,
    );
    const sessionId = sessionRecord.id;

    const sessionTokenUsage: SessionTokenUsage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    };

    const filesModified: string[] = [];
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: this._buildInitialMessage(assignment),
      },
    ];

    let summary = "";
    let finalStatus: TaskResult["status"] = "completed";

    try {
      let turnCount = 0;

      while (turnCount < MAX_TURNS) {
        if (this._abortController.signal.aborted) {
          finalStatus = "failed";
          summary = "Task was cancelled.";
          break;
        }

        turnCount++;

        const response = await this._client.messages.create({
          model,
          max_tokens: 8192,
          system: systemPrompt,
          tools: this._toolRegistry.getToolDefinitions(),
          messages,
        });

        // Record token usage for this call
        const callUsage = this._accumulateUsage(sessionTokenUsage, response);
        await this._sessionManager.recordTokenUsage(
          sessionId,
          {
            input: callUsage.inputTokens,
            output: callUsage.outputTokens,
            cacheRead: callUsage.cacheRead,
            cacheCreation: callUsage.cacheCreation,
          },
          model,
          null,
          this._db,
        );

        // Add assistant response to conversation history
        messages.push({
          role: "assistant",
          content: response.content,
        });

        // Collect any write/edit tool calls to track modified files
        for (const block of response.content) {
          if (block.type === "tool_use") {
            const input = block.input as Record<string, unknown>;
            const filePath =
              typeof input["file_path"] === "string" ? input["file_path"] : undefined;

            if (
              filePath &&
              (block.name === "write_file" || block.name === "edit_file")
            ) {
              if (!filesModified.includes(filePath)) {
                filesModified.push(filePath);
              }
            }
          }
        }

        if (response.stop_reason === "end_turn") {
          // Extract final text summary from the last assistant message
          for (const block of response.content) {
            if (block.type === "text" && block.text.trim()) {
              summary = block.text.trim();
              break;
            }
          }
          break;
        }

        if (response.stop_reason === "tool_use") {
          // Execute all tool_use blocks and collect results
          const toolUseBlocks = response.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const toolUse of toolUseBlocks) {
            let resultContent: string;
            let isError = false;

            try {
              const input = toolUse.input as Record<string, unknown>;
              resultContent = await this._toolRegistry.executeTool(
                toolUse.name,
                input,
              );
            } catch (err: unknown) {
              isError = true;
              resultContent =
                err instanceof Error
                  ? err.message
                  : `Tool execution failed: ${String(err)}`;
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: resultContent,
              is_error: isError,
            });
          }

          messages.push({
            role: "user",
            content: toolResults,
          });

          continue;
        }

        // Any other stop reason (max_tokens, stop_sequence) — stop the loop
        break;
      }

      if (turnCount >= MAX_TURNS && finalStatus === "completed") {
        finalStatus = "blocked";
        summary = summary || "Task reached maximum turn limit without completing.";
      }

      const totalTokens =
        sessionTokenUsage.input +
        sessionTokenUsage.output +
        sessionTokenUsage.cacheRead +
        sessionTokenUsage.cacheCreation;

      const driftScore = computeDriftScore(filesModified, goalContext.scopeFiles);

      // Check if drift is significant and emit event
      if (driftScore > 0.5 && filesModified.length > 0) {
        await this._eventBus.emit({
          type: "GOAL_DRIFT_DETECTED",
          taskId,
          agentRole,
          driftScore,
        });
      }

      const taskResult: TaskResult = {
        taskId,
        agentRole,
        sessionId,
        status: finalStatus,
        summary: summary || "Task completed.",
        filesModified,
        tokensUsed: totalTokens,
        driftScore,
      };

      // Update session to completed/failed
      await this._sessionManager.endSession(
        sessionId,
        finalStatus === "completed" ? "COMPLETED" : "FAILED",
        this._db,
      );

      // Emit outcome event
      if (finalStatus === "completed") {
        await this._eventBus.emit({
          type: "TASK_COMPLETED",
          taskId,
          result: taskResult,
        });
      } else {
        await this._eventBus.emit({
          type: "TASK_FAILED",
          taskId,
          error: summary,
        });
      }

      return taskResult;
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);

      await this._sessionManager.endSession(sessionId, "FAILED", this._db);

      await this._eventBus.emit({
        type: "TASK_FAILED",
        taskId,
        error: errorMessage,
      });

      const totalTokens =
        sessionTokenUsage.input +
        sessionTokenUsage.output +
        sessionTokenUsage.cacheRead +
        sessionTokenUsage.cacheCreation;

      return {
        taskId,
        agentRole,
        sessionId,
        status: "failed",
        summary: `Task failed: ${errorMessage}`,
        filesModified,
        tokensUsed: totalTokens,
        driftScore: 0,
      };
    }
  }
}
