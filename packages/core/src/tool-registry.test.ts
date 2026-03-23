import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ToolRegistry } from "./tool-registry.js";
import type { McpTool } from "./tool-registry.js";

const TEMP_DIR = join(tmpdir(), "tool-registry-test");

async function setupTempDir(): Promise<void> {
  await mkdir(TEMP_DIR, { recursive: true });
}

async function writeTempFile(name: string, content: string): Promise<string> {
  const filePath = join(TEMP_DIR, name);
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

async function removeTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch {
    // Ignore if already removed
  }
}

describe("ToolRegistry", () => {
  let registry: ToolRegistry;

  beforeEach(async () => {
    registry = new ToolRegistry();
    await setupTempDir();
  });

  describe("getToolDefinitions", () => {
    it("returns all built-in tool definitions", () => {
      const defs = registry.getToolDefinitions();
      const names = defs.map((d) => d.name);

      expect(names).toContain("read_file");
      expect(names).toContain("write_file");
      expect(names).toContain("edit_file");
      expect(names).toContain("glob_files");
      expect(names).toContain("grep_search");
      expect(names).toContain("run_bash");
      expect(names).toContain("list_files");
    });

    it("includes MCP tools after registration", () => {
      const mcpTool: McpTool = {
        name: "my_mcp_tool",
        description: "A test MCP tool",
        inputSchema: { type: "object", properties: {}, required: [] },
        async execute(): Promise<string> {
          return "mcp result";
        },
      };

      registry.registerMcpTools([mcpTool]);

      const defs = registry.getToolDefinitions();
      const names = defs.map((d) => d.name);
      expect(names).toContain("my_mcp_tool");
    });

    it("each tool definition has name, description, and input_schema", () => {
      const defs = registry.getToolDefinitions();
      for (const def of defs) {
        expect(typeof def.name).toBe("string");
        expect(typeof def.description).toBe("string");
        expect(def.input_schema).toBeDefined();
      }
    });
  });

  describe("read_file tool", () => {
    it("reads a file and returns content with line numbers", async () => {
      const filePath = await writeTempFile("read-test.txt", "line one\nline two\nline three");

      const result = await registry.executeTool("read_file", { file_path: filePath });

      expect(result).toContain("line one");
      expect(result).toContain("line two");
      expect(result).toContain("line three");
      expect(result).toContain("1\t");

      await removeTempFile(filePath);
    });

    it("respects offset and limit", async () => {
      const content = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
      const filePath = await writeTempFile("offset-test.txt", content);

      const result = await registry.executeTool("read_file", {
        file_path: filePath,
        offset: 3,
        limit: 2,
      });

      expect(result).toContain("line 3");
      expect(result).toContain("line 4");
      expect(result).not.toContain("line 1");
      expect(result).not.toContain("line 5");

      await removeTempFile(filePath);
    });

    it("throws when file does not exist", async () => {
      await expect(
        registry.executeTool("read_file", {
          file_path: join(TEMP_DIR, "nonexistent-file.txt"),
        }),
      ).rejects.toThrow();
    });
  });

  describe("write_file tool", () => {
    it("creates a new file with the given content", async () => {
      const filePath = join(TEMP_DIR, "write-test.txt");
      await registry.executeTool("write_file", {
        file_path: filePath,
        content: "hello world",
      });

      const result = await registry.executeTool("read_file", { file_path: filePath });
      expect(result).toContain("hello world");

      await removeTempFile(filePath);
    });

    it("returns a success message", async () => {
      const filePath = join(TEMP_DIR, "write-success.txt");
      const result = await registry.executeTool("write_file", {
        file_path: filePath,
        content: "test content",
      });

      expect(result).toContain("written successfully");

      await removeTempFile(filePath);
    });
  });

  describe("edit_file tool", () => {
    it("replaces first occurrence by default", async () => {
      const filePath = await writeTempFile(
        "edit-test.txt",
        "foo bar foo",
      );

      await registry.executeTool("edit_file", {
        file_path: filePath,
        old_string: "foo",
        new_string: "baz",
      });

      const result = await registry.executeTool("read_file", { file_path: filePath });
      expect(result).toContain("baz bar foo");

      await removeTempFile(filePath);
    });

    it("replaces all occurrences when replace_all is true", async () => {
      const filePath = await writeTempFile(
        "edit-all-test.txt",
        "foo bar foo",
      );

      await registry.executeTool("edit_file", {
        file_path: filePath,
        old_string: "foo",
        new_string: "baz",
        replace_all: true,
      });

      const result = await registry.executeTool("read_file", { file_path: filePath });
      expect(result).toContain("baz bar baz");

      await removeTempFile(filePath);
    });

    it("throws when old_string is not found", async () => {
      const filePath = await writeTempFile("edit-not-found.txt", "hello world");

      await expect(
        registry.executeTool("edit_file", {
          file_path: filePath,
          old_string: "not present",
          new_string: "replacement",
        }),
      ).rejects.toThrow("old_string not found");

      await removeTempFile(filePath);
    });
  });

  describe("list_files tool", () => {
    it("lists directory contents", async () => {
      const fileA = await writeTempFile("list-a.txt", "a");
      const fileB = await writeTempFile("list-b.txt", "b");

      const result = await registry.executeTool("list_files", { path: TEMP_DIR });

      expect(result).toContain("list-a.txt");
      expect(result).toContain("list-b.txt");

      await removeTempFile(fileA);
      await removeTempFile(fileB);
    });
  });

  describe("glob_files tool", () => {
    it("finds files matching a pattern", async () => {
      const fileA = await writeTempFile("glob-match.ts", "export const a = 1;");
      const fileB = await writeTempFile("glob-no-match.txt", "plain text");

      const result = await registry.executeTool("glob_files", {
        pattern: "**/*.ts",
        path: TEMP_DIR,
      });

      expect(result).toContain("glob-match.ts");
      expect(result).not.toContain("glob-no-match.txt");

      await removeTempFile(fileA);
      await removeTempFile(fileB);
    });

    it("returns a message when no files match", async () => {
      const result = await registry.executeTool("glob_files", {
        pattern: "**/*.xyz_nonexistent",
        path: TEMP_DIR,
      });

      expect(result).toContain("No files matched");
    });
  });

  describe("run_bash tool", () => {
    it("executes a command and returns output", async () => {
      const result = await registry.executeTool("run_bash", {
        command: "echo hello_from_bash",
      });

      expect(result).toContain("hello_from_bash");
    });

    it("returns (no output) for commands with empty output", async () => {
      const result = await registry.executeTool("run_bash", {
        command: "true",
      });

      expect(result).toBe("(no output)");
    });
  });

  describe("registerMcpTools", () => {
    it("allows calling a registered MCP tool", async () => {
      const mcpTool: McpTool = {
        name: "test_mcp",
        description: "A test MCP tool",
        inputSchema: { type: "object", properties: {}, required: [] },
        async execute(): Promise<string> {
          return "mcp executed";
        },
      };

      registry.registerMcpTools([mcpTool]);
      const result = await registry.executeTool("test_mcp", {});
      expect(result).toBe("mcp executed");
    });
  });

  describe("getMcpToolStubs", () => {
    it("returns stubs for api-registry and naming tools", () => {
      const stubs = registry.getMcpToolStubs();
      const names = stubs.map((s) => s.name);

      expect(names).toContain("api_register_endpoint");
      expect(names).toContain("api_check_drift");
      expect(names).toContain("naming_check_file");
    });

    it("api_register_endpoint stub returns a confirmation message", async () => {
      const stubs = registry.getMcpToolStubs();
      const stub = stubs.find((s) => s.name === "api_register_endpoint");
      expect(stub).toBeDefined();

      const result = await stub!.execute({ method: "POST", path: "/users" });
      expect(result).toContain("POST /users");
    });
  });

  describe("executeTool error handling", () => {
    it("throws for unknown tool names", async () => {
      await expect(
        registry.executeTool("nonexistent_tool", {}),
      ).rejects.toThrow("Unknown tool: nonexistent_tool");
    });
  });
});
