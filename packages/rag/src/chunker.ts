import ts from "typescript";

const MAX_CHUNK_TOKENS = 500;
const CHARS_PER_TOKEN = 4;
const MAX_CHUNK_CHARS = MAX_CHUNK_TOKENS * CHARS_PER_TOKEN;

export interface CodeChunk {
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkType: "function" | "class" | "interface" | "type" | "module" | "config";
  dependencies: string[];
  exports: string[];
}

interface RawChunk {
  name: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkType: CodeChunk["chunkType"];
  isExported: boolean;
}

export class CodeChunker {
  chunkFile(filePath: string, content: string): CodeChunk[] {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const tsExtensions = new Set(["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"]);

    if (!ext || !tsExtensions.has(ext)) {
      return this.chunkNonTs(filePath, content);
    }

    return this.chunkTs(filePath, content);
  }

  private chunkNonTs(filePath: string, content: string): CodeChunk[] {
    const fileName = filePath.split("/").pop() ?? filePath;
    const lines = content.split("\n");
    const chunk: CodeChunk = {
      name: fileName,
      content,
      startLine: 1,
      endLine: lines.length,
      chunkType: "config",
      dependencies: [],
      exports: [],
    };

    if (content.length > MAX_CHUNK_CHARS) {
      return this.splitChunkAtLineBreaks(chunk);
    }

    return [chunk];
  }

  private chunkTs(filePath: string, content: string): CodeChunk[] {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    );

    const allImports = this.extractImports(sourceFile);
    const rawChunks: RawChunk[] = [];
    const coveredRanges: { start: number; end: number }[] = [];

    for (const statement of sourceFile.statements) {
      const chunk = this.extractChunkFromNode(statement, sourceFile, content);
      if (chunk) {
        rawChunks.push(chunk);
        coveredRanges.push({
          start: chunk.startLine,
          end: chunk.endLine,
        });
      }
    }

    // Collect uncovered lines into a "module" chunk
    if (rawChunks.length === 0) {
      const lines = content.split("\n");
      rawChunks.push({
        name: filePath.split("/").pop() ?? "module",
        content,
        startLine: 1,
        endLine: lines.length,
        chunkType: "module",
        isExported: false,
      });
    }

    const result: CodeChunk[] = [];
    for (const raw of rawChunks) {
      const usedImports = this.findUsedImports(raw.content, allImports);
      const exportedNames = raw.isExported ? this.extractExportedNames(raw) : [];

      const chunk: CodeChunk = {
        name: raw.name,
        content: raw.content,
        startLine: raw.startLine,
        endLine: raw.endLine,
        chunkType: raw.chunkType,
        dependencies: usedImports,
        exports: exportedNames,
      };

      if (chunk.content.length > MAX_CHUNK_CHARS) {
        result.push(...this.splitChunkAtLineBreaks(chunk));
      } else {
        result.push(chunk);
      }
    }

    return result;
  }

  private extractChunkFromNode(
    node: ts.Statement,
    sourceFile: ts.SourceFile,
    fullContent: string,
  ): RawChunk | null {
    const isExported = this.hasExportModifier(node);
    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const chunkContent = fullContent.substring(node.getStart(sourceFile), node.getEnd());

    if (ts.isFunctionDeclaration(node) && node.name) {
      return {
        name: node.name.text,
        content: chunkContent,
        startLine: startLine + 1,
        endLine: endLine + 1,
        chunkType: "function",
        isExported,
      };
    }

    if (ts.isClassDeclaration(node) && node.name) {
      return {
        name: node.name.text,
        content: chunkContent,
        startLine: startLine + 1,
        endLine: endLine + 1,
        chunkType: "class",
        isExported,
      };
    }

    if (ts.isInterfaceDeclaration(node)) {
      return {
        name: node.name.text,
        content: chunkContent,
        startLine: startLine + 1,
        endLine: endLine + 1,
        chunkType: "interface",
        isExported,
      };
    }

    if (ts.isTypeAliasDeclaration(node)) {
      return {
        name: node.name.text,
        content: chunkContent,
        startLine: startLine + 1,
        endLine: endLine + 1,
        chunkType: "type",
        isExported,
      };
    }

    if (ts.isVariableStatement(node) && isExported) {
      const names = node.declarationList.declarations
        .map((d) => (ts.isIdentifier(d.name) ? d.name.text : "unknown"))
        .join(", ");
      return {
        name: names,
        content: chunkContent,
        startLine: startLine + 1,
        endLine: endLine + 1,
        chunkType: "module",
        isExported: true,
      };
    }

    return null;
  }

  private hasExportModifier(node: ts.Statement): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  private extractImports(sourceFile: ts.SourceFile): Map<string, string> {
    const imports = new Map<string, string>();

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;

      const moduleSpecifier = statement.moduleSpecifier;
      if (!ts.isStringLiteral(moduleSpecifier)) continue;
      const moduleName = moduleSpecifier.text;

      const importClause = statement.importClause;
      if (!importClause) continue;

      if (importClause.name) {
        imports.set(importClause.name.text, moduleName);
      }

      const namedBindings = importClause.namedBindings;
      if (namedBindings) {
        if (ts.isNamespaceImport(namedBindings)) {
          imports.set(namedBindings.name.text, moduleName);
        } else if (ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            imports.set(element.name.text, moduleName);
          }
        }
      }
    }

    return imports;
  }

  private findUsedImports(content: string, allImports: Map<string, string>): string[] {
    const used: string[] = [];
    for (const [identifier, moduleName] of allImports) {
      const regex = new RegExp(`\\b${identifier}\\b`);
      if (regex.test(content)) {
        const dep = `${identifier}:${moduleName}`;
        if (!used.includes(dep)) {
          used.push(dep);
        }
      }
    }
    return used;
  }

  private extractExportedNames(raw: RawChunk): string[] {
    if (!raw.isExported) return [];
    return raw.name.split(", ").map((n) => n.trim()).filter(Boolean);
  }

  private splitChunkAtLineBreaks(chunk: CodeChunk): CodeChunk[] {
    const lines = chunk.content.split("\n");
    const result: CodeChunk[] = [];
    let currentLines: string[] = [];
    let currentStartLine = chunk.startLine;
    let partIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      currentLines.push(lines[i]);
      const currentContent = currentLines.join("\n");

      if (currentContent.length >= MAX_CHUNK_CHARS && currentLines.length > 1) {
        // Remove last line and flush
        currentLines.pop();
        const flushContent = currentLines.join("\n");
        result.push({
          name: `${chunk.name}$part${partIndex}`,
          content: flushContent,
          startLine: currentStartLine,
          endLine: currentStartLine + currentLines.length - 1,
          chunkType: chunk.chunkType,
          dependencies: chunk.dependencies,
          exports: partIndex === 0 ? chunk.exports : [],
        });
        partIndex++;
        currentStartLine = currentStartLine + currentLines.length;
        currentLines = [lines[i]];
      }
    }

    if (currentLines.length > 0) {
      result.push({
        name: partIndex > 0 ? `${chunk.name}$part${partIndex}` : chunk.name,
        content: currentLines.join("\n"),
        startLine: currentStartLine,
        endLine: currentStartLine + currentLines.length - 1,
        chunkType: chunk.chunkType,
        dependencies: chunk.dependencies,
        exports: partIndex === 0 ? chunk.exports : [],
      });
    }

    return result;
  }
}
