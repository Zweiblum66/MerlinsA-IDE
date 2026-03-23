import { describe, it, expect } from "vitest";
import { CodeChunker } from "./chunker.js";

describe("CodeChunker", () => {
  const chunker = new CodeChunker();

  describe("chunkFile with TypeScript functions", () => {
    it("should chunk a standalone function declaration", () => {
      const content = `function greet(name: string): string {
  return "Hello, " + name;
}`;
      const chunks = chunker.chunkFile("app.ts", content);
      expect(chunks.length).toBe(1);
      expect(chunks[0].name).toBe("greet");
      expect(chunks[0].chunkType).toBe("function");
      expect(chunks[0].content).toContain("function greet");
    });

    it("should chunk multiple function declarations separately", () => {
      const content = `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}`;
      const chunks = chunker.chunkFile("math.ts", content);
      expect(chunks.length).toBe(2);
      expect(chunks[0].name).toBe("add");
      expect(chunks[0].chunkType).toBe("function");
      expect(chunks[1].name).toBe("subtract");
      expect(chunks[1].chunkType).toBe("function");
    });
  });

  describe("chunkFile with TypeScript classes", () => {
    it("should chunk a class declaration", () => {
      const content = `export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  subtract(a: number, b: number): number {
    return a - b;
  }
}`;
      const chunks = chunker.chunkFile("calculator.ts", content);
      expect(chunks.length).toBe(1);
      expect(chunks[0].name).toBe("Calculator");
      expect(chunks[0].chunkType).toBe("class");
      expect(chunks[0].exports).toContain("Calculator");
    });
  });

  describe("chunkFile with TypeScript interfaces", () => {
    it("should chunk an interface declaration", () => {
      const content = `export interface User {
  id: string;
  name: string;
  email: string;
}`;
      const chunks = chunker.chunkFile("types.ts", content);
      expect(chunks.length).toBe(1);
      expect(chunks[0].name).toBe("User");
      expect(chunks[0].chunkType).toBe("interface");
    });
  });

  describe("chunkFile with non-TypeScript files", () => {
    it("should handle non-TS files as a single config chunk", () => {
      const content = `{
  "name": "my-app",
  "version": "1.0.0"
}`;
      const chunks = chunker.chunkFile("package.json", content);
      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkType).toBe("config");
      expect(chunks[0].name).toBe("package.json");
      expect(chunks[0].content).toBe(content);
    });

    it("should handle yaml files as config chunks", () => {
      const content = `name: my-app\nversion: 1.0.0`;
      const chunks = chunker.chunkFile("config.yaml", content);
      expect(chunks.length).toBe(1);
      expect(chunks[0].chunkType).toBe("config");
    });
  });

  describe("max chunk size enforcement", () => {
    it("should split chunks exceeding max chunk size (500 tokens ~ 2000 chars)", () => {
      // Generate a non-TS file content that exceeds 2000 characters
      const longLine = "x".repeat(100);
      const lines: string[] = [];
      // 25 lines of 100 chars = 2500 chars, exceeding 2000 limit
      for (let i = 0; i < 25; i++) {
        lines.push(longLine);
      }
      const content = lines.join("\n");

      const chunks = chunker.chunkFile("data.txt", content);
      expect(chunks.length).toBeGreaterThan(1);

      // Each chunk's content should be at most ~2000 chars (with some tolerance for splitting)
      for (const chunk of chunks) {
        expect(chunk.content.length).toBeLessThanOrEqual(2100);
      }
    });

    it("should split large TypeScript functions that exceed max chunk size", () => {
      // Build a large function
      const bodyLines: string[] = [];
      for (let i = 0; i < 30; i++) {
        bodyLines.push(`  const var${i} = "${("a".repeat(60))}";`);
      }
      const content = `function bigFunction() {\n${bodyLines.join("\n")}\n}`;

      const chunks = chunker.chunkFile("big.ts", content);
      expect(chunks.length).toBeGreaterThan(1);
      // Part names should include $part suffix
      expect(chunks[0].name).toContain("bigFunction");
    });
  });

  describe("dependency tracking", () => {
    it("should track imports used by a function", () => {
      const content = `import { readFile } from "fs";
import { join } from "path";

export function loadConfig() {
  const path = join(".", "config.json");
  return readFile(path, "utf-8");
}`;
      const chunks = chunker.chunkFile("loader.ts", content);
      const fnChunk = chunks.find((c) => c.name === "loadConfig");
      expect(fnChunk).toBeDefined();
      expect(fnChunk!.dependencies).toContain("readFile:fs");
      expect(fnChunk!.dependencies).toContain("join:path");
    });
  });
});
