// ─── ESLint Config Generator ────────────────────────────────────

import type { NamingRule, NamingFormat } from "./rules.js";

interface EslintNamingConventionEntry {
  selector: string;
  format: string[];
  prefix?: string[];
  modifiers?: string[];
  leadingUnderscore?: "require" | "allow" | "forbid";
  custom?: {
    regex: string;
    match: boolean;
  };
}

interface EslintFlatConfig {
  languageOptions: {
    parser: string;
  };
  plugins: string[];
  rules: Record<string, [string, ...EslintNamingConventionEntry[]]>;
}

function mapFormatToEslint(format: NamingFormat): string {
  switch (format) {
    case "camelCase":
      return "camelCase";
    case "PascalCase":
      return "PascalCase";
    case "UPPER_CASE":
      return "UPPER_CASE";
    case "snake_case":
      return "snake_case";
    case "kebab-case":
      return "camelCase"; // ESLint naming-convention doesn't support kebab-case directly
  }
}

function mapSelectorToEslint(selector: string): string {
  switch (selector) {
    case "variable":
      return "variable";
    case "booleanVariable":
      return "variable";
    case "constant":
      return "variable";
    case "function":
      return "function";
    case "parameter":
      return "parameter";
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "typeAlias":
      return "typeAlias";
    case "enum":
      return "enum";
    case "enumMember":
      return "enumMember";
    case "privateMember":
      return "classProperty";
    default:
      return selector;
  }
}

function buildNamingConventionEntry(rule: NamingRule): EslintNamingConventionEntry {
  const entry: EslintNamingConventionEntry = {
    selector: mapSelectorToEslint(rule.selector),
    format: [mapFormatToEslint(rule.format)],
  };

  // Handle boolean variables with types filter
  if (rule.selector === "booleanVariable") {
    entry.prefix = rule.prefix;
    // ESLint naming-convention supports types filter for booleans
    (entry as unknown as Record<string, unknown>).types = ["boolean"];
  }

  // Handle module-level constants
  if (rule.selector === "constant") {
    entry.modifiers = ["const", "global"];
  }

  // Handle private members
  if (rule.selector === "privateMember") {
    entry.modifiers = ["private"];
    entry.leadingUnderscore = "require";
  }

  // Handle interface no-I-prefix
  if (rule.selector === "interface") {
    entry.custom = {
      regex: "^I[A-Z]",
      match: false,
    };
  }

  // Add prefix for rules that have them (excluding boolean which is handled above)
  if (rule.prefix && rule.selector !== "booleanVariable" && rule.selector !== "privateMember") {
    entry.prefix = rule.prefix;
  }

  return entry;
}

export function generateEslintConfig(rules: NamingRule[]): EslintFlatConfig {
  const namingConventionEntries = rules.map(buildNamingConventionEntry);

  return {
    languageOptions: {
      parser: "@typescript-eslint/parser",
    },
    plugins: ["@typescript-eslint"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        ...namingConventionEntries,
      ],
    },
  };
}
