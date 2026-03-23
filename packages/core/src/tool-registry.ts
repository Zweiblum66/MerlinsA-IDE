import { readFile, writeFile, readdir } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type Anthropic from "@anthropic-ai/sdk";
import fg from "fast-glob";

const execAsync = promisify(exec);

/** Shape of input passed to each tool executor. */
type ToolInput = Record<string, unknown>;

/** A registered tool with its Anthropic schema and execution handler. */
export interface RegisteredTool {
  definition: Anthropic.Tool;
  execute: (input: ToolInput) => Promise<string>;
}

/** MCP tool definition provided by an external server. */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: ToolInput) => Promise<string>;
}

function getString(input: ToolInput, key: string, fallback?: string): string {
  const value = input[key];
  if (typeof value === "string") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Tool input missing required string field: ${key}`);
}

function getOptionalString(
  input: ToolInput,
  key: string,
): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

function getOptionalNumber(
  input: ToolInput,
  key: string,
): number | undefined {
  const value = input[key];
  return typeof value === "number" ? value : undefined;
}

/** All built-in tool definitions and their handlers. */
const BUILTIN_TOOLS: RegisteredTool[] = [
  {
    definition: {
      name: "read_file",
      description:
        "Read the contents of a file at the given path. Returns the file content as a string.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path to the file to read.",
          },
          offset: {
            type: "number",
            description: "Line number to start reading from (1-based, optional).",
          },
          limit: {
            type: "number",
            description: "Maximum number of lines to read (optional).",
          },
        },
        required: ["file_path"],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const filePath = getString(input, "file_path");
      const offset = getOptionalNumber(input, "offset");
      const limit = getOptionalNumber(input, "limit");

      const raw = await readFile(filePath, "utf-8");
      const lines = raw.split("\n");

      const start = offset !== undefined ? offset - 1 : 0;
      const slice =
        limit !== undefined ? lines.slice(start, start + limit) : lines.slice(start);

      return slice
        .map((line, idx) => `${start + idx + 1}\t${line}`)
        .join("\n");
    },
  },

  {
    definition: {
      name: "write_file",
      description: "Write content to a file, creating or overwriting it.",
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path to the file to write.",
          },
          content: {
            type: "string",
            description: "Content to write to the file.",
          },
        },
        required: ["file_path", "content"],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const filePath = getString(input, "file_path");
      const content = getString(input, "content");
      await writeFile(filePath, content, "utf-8");
      return `File written successfully: ${filePath}`;
    },
  },

  {
    definition: {
      name: "edit_file",
      description:
        "Edit a file by replacing an exact old_string with new_string. The old_string must match exactly (including whitespace/indentation).",
      input_schema: {
        type: "object" as const,
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path to the file to edit.",
          },
          old_string: {
            type: "string",
            description: "The exact string to find and replace.",
          },
          new_string: {
            type: "string",
            description: "The replacement string.",
          },
          replace_all: {
            type: "boolean",
            description:
              "If true, replace all occurrences. Default is false (replace first occurrence only).",
          },
        },
        required: ["file_path", "old_string", "new_string"],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const filePath = getString(input, "file_path");
      const oldString = getString(input, "old_string");
      const newString = getString(input, "new_string");
      const replaceAll = input["replace_all"] === true;

      const content = await readFile(filePath, "utf-8");

      if (!content.includes(oldString)) {
        throw new Error(
          `old_string not found in file: ${filePath}\nSearched for:\n${oldString}`,
        );
      }

      const updated = replaceAll
        ? content.split(oldString).join(newString)
        : content.replace(oldString, newString);

      await writeFile(filePath, updated, "utf-8");
      return `File edited successfully: ${filePath}`;
    },
  },

  {
    definition: {
      name: "glob_files",
      description:
        "Find files matching a glob pattern. Returns a list of matching file paths.",
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: 'Glob pattern to match, e.g. "**/*.ts" or "src/**/*.js".',
          },
          path: {
            type: "string",
            description:
              "Directory to search in. Defaults to current working directory.",
          },
        },
        required: ["pattern"],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const pattern = getString(input, "pattern");
      const cwd = getOptionalString(input, "path") ?? process.cwd();

      const matches = await fg(pattern, { cwd, onlyFiles: true });
      matches.sort();

      if (matches.length === 0) {
        return "No files matched the pattern.";
      }

      return matches.join("\n");
    },
  },

  {
    definition: {
      name: "grep_search",
      description:
        "Search for a regex pattern in file contents. Returns matching lines with file paths.",
      input_schema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: "Regular expression pattern to search for.",
          },
          path: {
            type: "string",
            description:
              "File or directory to search in. Defaults to current working directory.",
          },
          glob: {
            type: "string",
            description: 'Glob filter for files, e.g. "*.ts".',
          },
          case_insensitive: {
            type: "boolean",
            description: "If true, match case-insensitively.",
          },
          max_results: {
            type: "number",
            description: "Maximum number of matching lines to return.",
          },
        },
        required: ["pattern"],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const pattern = getString(input, "pattern");
      const searchPath = getOptionalString(input, "path") ?? process.cwd();
      const glob = getOptionalString(input, "glob");
      const caseInsensitive = input["case_insensitive"] === true;
      const maxResults = getOptionalNumber(input, "max_results") ?? 200;

      const rgArgs = ["rg", "--line-number", "--no-heading"];
      if (caseInsensitive) rgArgs.push("--ignore-case");
      if (glob) rgArgs.push("--glob", glob);
      rgArgs.push("--max-count", String(maxResults));
      rgArgs.push(pattern, searchPath);

      try {
        const { stdout } = await execAsync(rgArgs.join(" "), {
          maxBuffer: 10 * 1024 * 1024,
        });
        const lines = stdout.trim().split("\n").slice(0, maxResults);
        return lines.join("\n") || "No matches found.";
      } catch (err: unknown) {
        // ripgrep exits with code 1 when no matches are found — that is not an error
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          (err as { code: unknown }).code === 1
        ) {
          return "No matches found.";
        }
        // Fall back to Node.js regex search if rg is unavailable
        const regexFlags = caseInsensitive ? "gi" : "g";
        const regex = new RegExp(pattern, regexFlags);
        const filePattern = glob ?? "**/*";
        const files = await fg(filePattern, {
          cwd: searchPath,
          onlyFiles: true,
        });
        const results: string[] = [];

        for (const file of files) {
          if (results.length >= maxResults) break;
          try {
            const content = await readFile(
              `${searchPath}/${file}`,
              "utf-8",
            );
            const fileLines = content.split("\n");
            for (let i = 0; i < fileLines.length; i++) {
              if (regex.test(fileLines[i])) {
                results.push(`${file}:${i + 1}:${fileLines[i]}`);
                if (results.length >= maxResults) break;
              }
            }
          } catch {
            // Skip files that cannot be read
          }
        }

        return results.length > 0 ? results.join("\n") : "No matches found.";
      }
    },
  },

  {
    definition: {
      name: "run_bash",
      description:
        "Execute a shell command and return its output. Avoid destructive commands. Working directory is the project root.",
      input_schema: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute.",
          },
          timeout_ms: {
            type: "number",
            description: "Timeout in milliseconds. Default is 30000.",
          },
        },
        required: ["command"],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const command = getString(input, "command");
      const timeoutMs = getOptionalNumber(input, "timeout_ms") ?? 30_000;

      const { stdout, stderr } = await execAsync(command, {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      const parts: string[] = [];
      if (stdout.trim()) parts.push(stdout.trim());
      if (stderr.trim()) parts.push(`[stderr]\n${stderr.trim()}`);
      return parts.join("\n") || "(no output)";
    },
  },

  {
    definition: {
      name: "list_files",
      description: "List the contents of a directory.",
      input_schema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Directory path to list. Defaults to current working directory.",
          },
        },
        required: [],
      },
    },
    async execute(input: ToolInput): Promise<string> {
      const dirPath = getOptionalString(input, "path") ?? process.cwd();
      const entries = await readdir(dirPath, { withFileTypes: true });
      const lines = entries.map(
        (e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`,
      );
      return lines.join("\n") || "(empty directory)";
    },
  },
];

/** Registry that manages built-in and MCP tools for agent execution. */
export class ToolRegistry {
  private readonly _builtinTools: RegisteredTool[];
  private readonly _mcpTools: Map<string, McpTool>;

  constructor() {
    this._builtinTools = [...BUILTIN_TOOLS];
    this._mcpTools = new Map();
  }

  /**
   * Register MCP server tools so agents can call them during a session.
   * @param tools - Array of MCP tools to register.
   */
  registerMcpTools(tools: McpTool[]): void {
    for (const tool of tools) {
      this._mcpTools.set(tool.name, tool);
    }
  }

  /**
   * Returns all tool definitions formatted for the Anthropic messages API.
   */
  getToolDefinitions(): Anthropic.Tool[] {
    const builtin = this._builtinTools.map((t) => t.definition);
    const mcp = Array.from(this._mcpTools.values()).map(
      (t): Anthropic.Tool => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
      }),
    );
    return [...builtin, ...mcp];
  }

  /**
   * Execute a tool by name with the provided input.
   * @param name - Tool name.
   * @param input - Tool input from the API response.
   * @returns The string result of the tool execution.
   */
  async executeTool(name: string, input: ToolInput): Promise<string> {
    // Check MCP tools first
    const mcpTool = this._mcpTools.get(name);
    if (mcpTool) {
      return mcpTool.execute(input);
    }

    // Check built-in tools
    const builtinTool = this._builtinTools.find(
      (t) => t.definition.name === name,
    );
    if (builtinTool) {
      return builtinTool.execute(input);
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  /**
   * Returns placeholder stub tools for MCP servers (api-registry, naming).
   * In production these would be populated from actual MCP server connections.
   */
  getMcpToolStubs(): McpTool[] {
    return [
      {
        name: "api_register_endpoint",
        description:
          "Register a new API endpoint in the API contract registry.",
        inputSchema: {
          type: "object",
          properties: {
            method: { type: "string", description: "HTTP method (GET, POST, PUT, DELETE, PATCH)." },
            path: { type: "string", description: "URL path pattern, e.g. /users/:id." },
            description: { type: "string", description: "Short description of the endpoint." },
            request_schema: { type: "object", description: "JSON Schema for the request body." },
            response_schema: { type: "object", description: "JSON Schema for the response body." },
          },
          required: ["method", "path", "description"],
        },
        async execute(input: ToolInput): Promise<string> {
          const method = typeof input["method"] === "string" ? input["method"] : "UNKNOWN";
          const path = typeof input["path"] === "string" ? input["path"] : "UNKNOWN";
          return `[api-registry] Registered endpoint: ${method} ${path}`;
        },
      },
      {
        name: "api_check_drift",
        description:
          "Check whether frontend API calls match the registered backend contracts.",
        inputSchema: {
          type: "object",
          properties: {
            file_paths: {
              type: "array",
              items: { type: "string" },
              description: "Files to check for API drift.",
            },
          },
          required: [],
        },
        async execute(_input: ToolInput): Promise<string> {
          return "[api-registry] No API drift detected.";
        },
      },
      {
        name: "naming_check_file",
        description:
          "Check a source file for naming convention violations.",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Path to the file to check." },
          },
          required: ["file_path"],
        },
        async execute(input: ToolInput): Promise<string> {
          const path = typeof input["file_path"] === "string" ? input["file_path"] : "unknown";
          return `[naming] No violations found in ${path}`;
        },
      },
    ];
  }
}
