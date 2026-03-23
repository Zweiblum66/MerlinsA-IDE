// ─── AST-Based Naming Analyzer ──────────────────────────────────

import ts from "typescript";
import {
  type NamingRule,
  type NamingFormat,
  validateName,
  DEFAULT_NAMING_RULES,
} from "./rules.js";

export interface NamingViolation {
  filePath: string;
  line: number;
  column: number;
  identifierName: string;
  expectedFormat: NamingFormat;
  rule: NamingRule;
  severity: "error" | "warning";
  suggestion?: string;
}

export class NamingAnalyzer {
  private readonly rules: NamingRule[];
  private readonly ruleMap: Map<string, NamingRule>;

  constructor(rules: NamingRule[] = DEFAULT_NAMING_RULES) {
    this.rules = rules;
    this.ruleMap = new Map(rules.map((r) => [r.selector, r]));
  }

  analyzeFile(filePath: string, content: string): NamingViolation[] {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const violations: NamingViolation[] = [];
    this.walkNode(sourceFile, sourceFile, violations, filePath);
    return violations;
  }

  private walkNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    this.checkNode(node, sourceFile, violations, filePath);
    ts.forEachChild(node, (child) => {
      this.walkNode(child, sourceFile, violations, filePath);
    });
  }

  private checkNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    if (ts.isVariableDeclaration(node)) {
      this.checkVariableDeclaration(node, sourceFile, violations, filePath);
    } else if (ts.isFunctionDeclaration(node)) {
      this.checkIdentifier(node.name, "function", sourceFile, violations, filePath);
    } else if (ts.isClassDeclaration(node)) {
      this.checkIdentifier(node.name, "class", sourceFile, violations, filePath);
    } else if (ts.isInterfaceDeclaration(node)) {
      this.checkInterfaceDeclaration(node, sourceFile, violations, filePath);
    } else if (ts.isTypeAliasDeclaration(node)) {
      this.checkIdentifier(node.name, "typeAlias", sourceFile, violations, filePath);
    } else if (ts.isEnumDeclaration(node)) {
      this.checkIdentifier(node.name, "enum", sourceFile, violations, filePath);
      this.checkEnumMembers(node, sourceFile, violations, filePath);
    } else if (ts.isParameter(node)) {
      this.checkParameter(node, sourceFile, violations, filePath);
    } else if (ts.isPropertyDeclaration(node)) {
      this.checkPropertyDeclaration(node, sourceFile, violations, filePath);
    }
  }

  private checkVariableDeclaration(
    node: ts.VariableDeclaration,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    if (!ts.isIdentifier(node.name)) return;

    const name = node.name.text;

    // Check if it's a module-level constant (const at top-level or module scope)
    const isModuleLevel = this.isModuleLevelDeclaration(node);
    const isConst = this.isConstDeclaration(node);

    if (isModuleLevel && isConst && !this.looksLikeFunction(node)) {
      this.checkIdentifier(node.name, "constant", sourceFile, violations, filePath);
      return;
    }

    // Check if it's a boolean variable
    if (this.isBooleanType(node)) {
      this.checkIdentifier(node.name, "booleanVariable", sourceFile, violations, filePath);
      return;
    }

    // Regular variable
    this.checkIdentifier(node.name, "variable", sourceFile, violations, filePath);
  }

  private checkInterfaceDeclaration(
    node: ts.InterfaceDeclaration,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    if (!node.name) return;

    const name = node.name.text;

    // Check for I prefix (not allowed)
    if (name.length > 1 && name.startsWith("I") && name[1] === name[1].toUpperCase()) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        node.name.getStart(sourceFile),
      );
      const rule = this.ruleMap.get("interface");
      if (rule) {
        violations.push({
          filePath,
          line: line + 1,
          column: character + 1,
          identifierName: name,
          expectedFormat: rule.format,
          rule,
          severity: "warning",
          suggestion: name.slice(1),
        });
        return;
      }
    }

    this.checkIdentifier(node.name, "interface", sourceFile, violations, filePath);
  }

  private checkEnumMembers(
    node: ts.EnumDeclaration,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    for (const member of node.members) {
      if (ts.isIdentifier(member.name)) {
        this.checkIdentifier(member.name, "enumMember", sourceFile, violations, filePath);
      }
    }
  }

  private checkParameter(
    node: ts.ParameterDeclaration,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    if (!ts.isIdentifier(node.name)) return;
    this.checkIdentifier(node.name, "parameter", sourceFile, violations, filePath);
  }

  private checkPropertyDeclaration(
    node: ts.PropertyDeclaration,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    if (!ts.isIdentifier(node.name)) return;

    const hasPrivateModifier = node.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.PrivateKeyword,
    );

    if (hasPrivateModifier) {
      this.checkIdentifier(node.name, "privateMember", sourceFile, violations, filePath);
    }
  }

  private checkIdentifier(
    identifier: ts.Identifier | undefined,
    selector: string,
    sourceFile: ts.SourceFile,
    violations: NamingViolation[],
    filePath: string,
  ): void {
    if (!identifier) return;

    const rule = this.ruleMap.get(selector);
    if (!rule) return;

    const name = identifier.text;

    // Skip destructured/underscore-only names
    if (name === "_") return;

    // For private members, validate with underscore prefix awareness
    let nameToValidate = name;
    let prefix = rule.prefix;

    if (selector === "privateMember") {
      // Private members should have leading underscore, then camelCase
      if (!name.startsWith("_")) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          identifier.getStart(sourceFile),
        );
        violations.push({
          filePath,
          line: line + 1,
          column: character + 1,
          identifierName: name,
          expectedFormat: rule.format,
          rule,
          severity: "error",
          suggestion: `_${name}`,
        });
        return;
      }
      nameToValidate = name.slice(1);
      prefix = undefined; // Don't check prefix on the inner name
    }

    const result = validateName(nameToValidate, rule.format, prefix);

    if (!result.isValid) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        identifier.getStart(sourceFile),
      );
      const suggestion =
        selector === "privateMember" && result.suggestion
          ? `_${result.suggestion}`
          : result.suggestion;

      violations.push({
        filePath,
        line: line + 1,
        column: character + 1,
        identifierName: name,
        expectedFormat: rule.format,
        rule,
        severity: "error",
        suggestion,
      });
    }
  }

  private isModuleLevelDeclaration(node: ts.VariableDeclaration): boolean {
    // Walk up to the VariableStatement and check if its parent is SourceFile or ModuleBlock
    const variableList = node.parent;
    if (!ts.isVariableDeclarationList(variableList)) return false;

    const statement = variableList.parent;
    if (!ts.isVariableStatement(statement)) return false;

    return (
      ts.isSourceFile(statement.parent) || ts.isModuleBlock(statement.parent)
    );
  }

  private isConstDeclaration(node: ts.VariableDeclaration): boolean {
    const declarationList = node.parent;
    if (!ts.isVariableDeclarationList(declarationList)) return false;
    return (declarationList.flags & ts.NodeFlags.Const) !== 0;
  }

  private isBooleanType(node: ts.VariableDeclaration): boolean {
    // Heuristic: check if type annotation is boolean or initializer is a boolean expression
    if (node.type && ts.isTypeReferenceNode(node.type)) {
      return false;
    }
    if (node.type && node.type.kind === ts.SyntaxKind.BooleanKeyword) {
      return true;
    }
    // Check initializer for boolean literals or common boolean expressions
    if (node.initializer) {
      if (
        node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
        node.initializer.kind === ts.SyntaxKind.FalseKeyword
      ) {
        return true;
      }
    }
    return false;
  }

  private looksLikeFunction(node: ts.VariableDeclaration): boolean {
    // Check if the initializer is an arrow function or function expression
    if (!node.initializer) return false;
    return (
      ts.isArrowFunction(node.initializer) ||
      ts.isFunctionExpression(node.initializer)
    );
  }
}
