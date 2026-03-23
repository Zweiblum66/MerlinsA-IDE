import { describe, it, expect } from "vitest";
import { validateName } from "./rules.js";

describe("validateName", () => {
  describe("camelCase validation", () => {
    it("should validate 'myVar' as valid camelCase", () => {
      const result = validateName("myVar", "camelCase");
      expect(result.isValid).toBe(true);
    });

    it("should validate 'MyVar' as invalid camelCase", () => {
      const result = validateName("MyVar", "camelCase");
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toBeDefined();
    });

    it("should validate single lowercase word as valid camelCase", () => {
      const result = validateName("name", "camelCase");
      expect(result.isValid).toBe(true);
    });
  });

  describe("PascalCase validation", () => {
    it("should validate 'MyClass' as valid PascalCase", () => {
      const result = validateName("MyClass", "PascalCase");
      expect(result.isValid).toBe(true);
    });

    it("should validate 'myClass' as invalid PascalCase", () => {
      const result = validateName("myClass", "PascalCase");
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toBe("MyClass");
    });
  });

  describe("UPPER_CASE validation", () => {
    it("should validate 'MAX_SIZE' as valid UPPER_CASE", () => {
      const result = validateName("MAX_SIZE", "UPPER_CASE");
      expect(result.isValid).toBe(true);
    });

    it("should validate 'MAX' as valid UPPER_CASE", () => {
      const result = validateName("MAX", "UPPER_CASE");
      expect(result.isValid).toBe(true);
    });

    it("should validate 'maxSize' as invalid UPPER_CASE", () => {
      const result = validateName("maxSize", "UPPER_CASE");
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toBe("MAX_SIZE");
    });
  });

  describe("snake_case validation", () => {
    it("should validate 'my_variable' as valid snake_case", () => {
      const result = validateName("my_variable", "snake_case");
      expect(result.isValid).toBe(true);
    });

    it("should validate 'myVariable' as invalid snake_case", () => {
      const result = validateName("myVariable", "snake_case");
      expect(result.isValid).toBe(false);
    });
  });

  describe("kebab-case validation", () => {
    it("should validate 'my-component' as valid kebab-case", () => {
      const result = validateName("my-component", "kebab-case");
      expect(result.isValid).toBe(true);
    });
  });

  describe("prefix validation", () => {
    it("should validate 'isActive' with prefix ['is', 'has'] as valid", () => {
      const result = validateName("isActive", "camelCase", ["is", "has"]);
      expect(result.isValid).toBe(true);
    });

    it("should validate 'hasItems' with prefix ['is', 'has'] as valid", () => {
      const result = validateName("hasItems", "camelCase", ["is", "has"]);
      expect(result.isValid).toBe(true);
    });

    it("should validate 'active' without required prefix as invalid", () => {
      const result = validateName("active", "camelCase", ["is", "has"]);
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toBeDefined();
      // Suggestion should include the prefix
      expect(result.suggestion).toMatch(/^is/);
    });

    it("should validate 'shouldUpdate' with prefix ['should', 'can'] as valid", () => {
      const result = validateName("shouldUpdate", "camelCase", ["should", "can"]);
      expect(result.isValid).toBe(true);
    });
  });

  describe("leading underscore handling", () => {
    it("should validate '_privateVar' as valid camelCase with leading underscore", () => {
      const result = validateName("_privateVar", "camelCase");
      expect(result.isValid).toBe(true);
    });

    it("should validate '_PrivateVar' as invalid camelCase with leading underscore", () => {
      const result = validateName("_PrivateVar", "camelCase");
      expect(result.isValid).toBe(false);
      expect(result.suggestion).toBe("_privateVar");
    });
  });
});
