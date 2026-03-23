// ─── Naming Convention Rules ────────────────────────────────────

export type NamingFormat =
  | "camelCase"
  | "PascalCase"
  | "UPPER_CASE"
  | "snake_case"
  | "kebab-case";

export interface NamingRule {
  selector: string;
  format: NamingFormat;
  prefix?: string[];
  modifiers?: string[];
  description: string;
}

export interface ValidationResult {
  isValid: boolean;
  suggestion?: string;
}

// ─── Format Checking Helpers ────────────────────────────────────

const CAMEL_CASE_REGEX = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL_CASE_REGEX = /^[A-Z][a-zA-Z0-9]*$/;
const UPPER_CASE_REGEX = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;
const SNAKE_CASE_REGEX = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const KEBAB_CASE_REGEX = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function isCamelCase(name: string): boolean {
  return CAMEL_CASE_REGEX.test(name);
}

function isPascalCase(name: string): boolean {
  return PASCAL_CASE_REGEX.test(name);
}

function isUpperCase(name: string): boolean {
  return UPPER_CASE_REGEX.test(name);
}

function isSnakeCase(name: string): boolean {
  return SNAKE_CASE_REGEX.test(name);
}

function isKebabCase(name: string): boolean {
  return KEBAB_CASE_REGEX.test(name);
}

function checkFormat(name: string, format: NamingFormat): boolean {
  switch (format) {
    case "camelCase":
      return isCamelCase(name);
    case "PascalCase":
      return isPascalCase(name);
    case "UPPER_CASE":
      return isUpperCase(name);
    case "snake_case":
      return isSnakeCase(name);
    case "kebab-case":
      return isKebabCase(name);
  }
}

// ─── Conversion Helpers ─────────────────────────────────────────

function splitWords(name: string): string[] {
  // Remove leading underscore for private members
  const cleaned = name.replace(/^_+/, "");

  // Split on transitions: camelCase, PascalCase, UPPER_CASE, snake_case, kebab-case
  return cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function toCamelCase(words: string[]): string {
  if (words.length === 0) return "";
  return (
    words[0].toLowerCase() +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("")
  );
}

function toPascalCase(words: string[]): string {
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toUpperCase(words: string[]): string {
  return words.map((w) => w.toUpperCase()).join("_");
}

function toSnakeCase(words: string[]): string {
  return words.map((w) => w.toLowerCase()).join("_");
}

function toKebabCase(words: string[]): string {
  return words.map((w) => w.toLowerCase()).join("-");
}

function convertToFormat(name: string, format: NamingFormat): string {
  const words = splitWords(name);
  if (words.length === 0) return name;

  switch (format) {
    case "camelCase":
      return toCamelCase(words);
    case "PascalCase":
      return toPascalCase(words);
    case "UPPER_CASE":
      return toUpperCase(words);
    case "snake_case":
      return toSnakeCase(words);
    case "kebab-case":
      return toKebabCase(words);
  }
}

// ─── Validation ─────────────────────────────────────────────────

export function validateName(
  name: string,
  expectedFormat: NamingFormat,
  prefix?: string[],
): ValidationResult {
  // Handle leading underscore for private members
  const hasLeadingUnderscore = name.startsWith("_");
  const nameToCheck = hasLeadingUnderscore ? name.slice(1) : name;

  // Check prefix requirement
  if (prefix && prefix.length > 0) {
    const hasValidPrefix = prefix.some((p) => {
      if (!nameToCheck.startsWith(p)) return false;
      // The character after the prefix must be uppercase (for camelCase boolean names like isValid)
      const charAfterPrefix = nameToCheck.charAt(p.length);
      return charAfterPrefix === charAfterPrefix.toUpperCase() && charAfterPrefix !== "";
    });

    if (!hasValidPrefix) {
      const suggestedPrefix = prefix[0];
      const words = splitWords(nameToCheck);
      const baseName = toCamelCase(words);
      const suggestion =
        (hasLeadingUnderscore ? "_" : "") +
        suggestedPrefix +
        baseName.charAt(0).toUpperCase() +
        baseName.slice(1);
      return {
        isValid: false,
        suggestion,
      };
    }
  }

  // Check format
  const isValid = checkFormat(nameToCheck, expectedFormat);

  if (isValid) {
    return { isValid: true };
  }

  // Generate suggestion
  const converted = convertToFormat(nameToCheck, expectedFormat);
  const suggestion = hasLeadingUnderscore ? `_${converted}` : converted;

  return {
    isValid: false,
    suggestion,
  };
}

// ─── Default Rules ──────────────────────────────────────────────

export const DEFAULT_NAMING_RULES: NamingRule[] = [
  {
    selector: "variable",
    format: "camelCase",
    description: "Variables should use camelCase",
  },
  {
    selector: "booleanVariable",
    format: "camelCase",
    prefix: ["is", "has", "should", "can", "will"],
    description:
      "Boolean variables should use camelCase with prefix: is, has, should, can, will",
  },
  {
    selector: "constant",
    format: "UPPER_CASE",
    modifiers: ["module-level"],
    description: "Module-level constants should use UPPER_CASE",
  },
  {
    selector: "function",
    format: "camelCase",
    description: "Functions should use camelCase",
  },
  {
    selector: "parameter",
    format: "camelCase",
    description: "Parameters should use camelCase",
  },
  {
    selector: "class",
    format: "PascalCase",
    description: "Classes should use PascalCase",
  },
  {
    selector: "interface",
    format: "PascalCase",
    description: "Interfaces should use PascalCase (no I prefix)",
  },
  {
    selector: "typeAlias",
    format: "PascalCase",
    description: "Type aliases should use PascalCase",
  },
  {
    selector: "enum",
    format: "PascalCase",
    description: "Enums should use PascalCase",
  },
  {
    selector: "enumMember",
    format: "UPPER_CASE",
    description: "Enum members should use UPPER_CASE",
  },
  {
    selector: "privateMember",
    format: "camelCase",
    prefix: ["_"],
    modifiers: ["private"],
    description: "Private members should use camelCase with leading underscore",
  },
];
