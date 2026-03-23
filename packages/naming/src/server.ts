// ─── Naming Convention MCP Server ────────────────────────────────

import { NamingAnalyzer, type NamingViolation } from "./analyzer.js";
import {
  type NamingRule,
  type NamingFormat,
  validateName,
  DEFAULT_NAMING_RULES,
} from "./rules.js";

// ─── Tool Input Schemas ─────────────────────────────────────────

const CHECK_FILE_SCHEMA = {
  type: "object" as const,
  properties: {
    filePath: {
      type: "string" as const,
      description: "Path to the TypeScript file to check",
    },
    content: {
      type: "string" as const,
      description: "Content of the file to check",
    },
  },
  required: ["filePath", "content"],
};

const SUGGEST_NAME_SCHEMA = {
  type: "object" as const,
  properties: {
    name: {
      type: "string" as const,
      description: "The current identifier name",
    },
    selector: {
      type: "string" as const,
      description:
        "The type of identifier: variable, function, class, interface, typeAlias, enum, enumMember, parameter, constant, booleanVariable, privateMember",
    },
  },
  required: ["name", "selector"],
};

const CHECK_NAME_SCHEMA = {
  type: "object" as const,
  properties: {
    name: {
      type: "string" as const,
      description: "The identifier name to check",
    },
    format: {
      type: "string" as const,
      description: "Expected format: camelCase, PascalCase, UPPER_CASE, snake_case, kebab-case",
    },
    prefix: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Optional allowed prefixes",
    },
  },
  required: ["name", "format"],
};

const GET_RULES_SCHEMA = {
  type: "object" as const,
  properties: {},
  required: [] as string[],
};

// ─── Tool Definitions ───────────────────────────────────────────

export interface NamingTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

export function createNamingServer(
  rules: NamingRule[] = DEFAULT_NAMING_RULES,
): { tools: Record<string, NamingTool> } {
  const analyzer = new NamingAnalyzer(rules);
  const ruleMap = new Map(rules.map((r) => [r.selector, r]));

  const tools: Record<string, NamingTool> = {
    naming_check_file: {
      name: "naming_check_file",
      description:
        "Validate all identifier names in a TypeScript file against naming conventions. Returns a list of violations with suggestions.",
      inputSchema: CHECK_FILE_SCHEMA,
      handler: async (input: Record<string, unknown>): Promise<{ violations: NamingViolation[]; summary: string }> => {
        const filePath = input.filePath as string;
        const content = input.content as string;

        const violations = analyzer.analyzeFile(filePath, content);

        return {
          violations,
          summary: `Found ${violations.length} naming violation(s) in ${filePath}`,
        };
      },
    },

    naming_suggest_name: {
      name: "naming_suggest_name",
      description:
        "Suggest a naming-convention-compliant name for a given identifier based on its type (variable, function, class, etc.).",
      inputSchema: SUGGEST_NAME_SCHEMA,
      handler: async (input: Record<string, unknown>): Promise<{ suggestion: string; rule: NamingRule | null; format: string }> => {
        const name = input.name as string;
        const selector = input.selector as string;

        const rule = ruleMap.get(selector) ?? null;
        if (!rule) {
          return {
            suggestion: name,
            rule: null,
            format: "unknown",
          };
        }

        const result = validateName(name, rule.format, rule.prefix);

        return {
          suggestion: result.isValid ? name : (result.suggestion ?? name),
          rule,
          format: rule.format,
        };
      },
    },

    naming_check_name: {
      name: "naming_check_name",
      description:
        "Check if a specific identifier name follows the expected naming convention format.",
      inputSchema: CHECK_NAME_SCHEMA,
      handler: async (input: Record<string, unknown>): Promise<{ isValid: boolean; suggestion?: string; format: string }> => {
        const name = input.name as string;
        const format = input.format as NamingFormat;
        const prefix = input.prefix as string[] | undefined;

        const result = validateName(name, format, prefix);

        return {
          isValid: result.isValid,
          suggestion: result.suggestion,
          format,
        };
      },
    },

    naming_get_rules: {
      name: "naming_get_rules",
      description:
        "Get the active naming convention rules including selectors, formats, and prefixes.",
      inputSchema: GET_RULES_SCHEMA,
      handler: async (): Promise<{ rules: NamingRule[]; count: number }> => {
        return {
          rules,
          count: rules.length,
        };
      },
    },
  };

  return { tools };
}
