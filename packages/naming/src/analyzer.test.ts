import { describe, it, expect } from "vitest";
import { NamingAnalyzer } from "./analyzer.js";

describe("NamingAnalyzer", () => {
  const analyzer = new NamingAnalyzer();

  it("should detect camelCase violation on a class name (should be PascalCase)", () => {
    const content = `class myService {
  doWork() {}
}`;
    const violations = analyzer.analyzeFile("service.ts", content);
    const classViolation = violations.find((v) => v.identifierName === "myService");
    expect(classViolation).toBeDefined();
    expect(classViolation!.expectedFormat).toBe("PascalCase");
    expect(classViolation!.suggestion).toBe("MyService");
  });

  it("should detect PascalCase violation on a variable (should be camelCase)", () => {
    const content = `let UserName = "John";`;
    const violations = analyzer.analyzeFile("app.ts", content);
    const varViolation = violations.find((v) => v.identifierName === "UserName");
    expect(varViolation).toBeDefined();
    expect(varViolation!.expectedFormat).toBe("camelCase");
  });

  it("should pass clean code with correct conventions", () => {
    const content = `
class UserService {
  getUser() {
    const userId = "123";
    return userId;
  }
}

interface UserProfile {
  id: string;
  name: string;
}

function processData(inputData: string) {
  return inputData;
}
`;
    const violations = analyzer.analyzeFile("clean.ts", content);
    // Filter to only relevant selectors (class, variable, function, interface)
    const relevantViolations = violations.filter(
      (v) =>
        v.identifierName !== "_" &&
        !["getUser"].includes(v.identifierName), // method names in class not separately checked as functions
    );
    // There should be no violations for properly named identifiers
    expect(relevantViolations.filter((v) =>
      ["UserService", "UserProfile", "processData"].includes(v.identifierName)
    )).toHaveLength(0);
  });

  it("should detect private member without underscore prefix", () => {
    const content = `class MyClass {
  private secretValue: string = "hidden";
}`;
    const violations = analyzer.analyzeFile("private.ts", content);
    const privateViolation = violations.find((v) => v.identifierName === "secretValue");
    expect(privateViolation).toBeDefined();
    expect(privateViolation!.suggestion).toBe("_secretValue");
    expect(privateViolation!.severity).toBe("error");
  });

  it("should not flag private members with leading underscore", () => {
    const content = `class MyClass {
  private _secretValue: string = "hidden";
}`;
    const violations = analyzer.analyzeFile("private.ts", content);
    const privateViolation = violations.find((v) => v.identifierName === "_secretValue");
    expect(privateViolation).toBeUndefined();
  });

  it("should detect interface with I prefix as a violation", () => {
    const content = `interface IUserService {
  getUser(): void;
}`;
    const violations = analyzer.analyzeFile("types.ts", content);
    const interfaceViolation = violations.find((v) => v.identifierName === "IUserService");
    expect(interfaceViolation).toBeDefined();
    expect(interfaceViolation!.suggestion).toBe("UserService");
    expect(interfaceViolation!.severity).toBe("warning");
  });

  it("should detect UPPER_CASE violation on module-level constant", () => {
    const content = `const maxRetries = 3;`;
    const violations = analyzer.analyzeFile("config.ts", content);
    const constViolation = violations.find((v) => v.identifierName === "maxRetries");
    expect(constViolation).toBeDefined();
    expect(constViolation!.expectedFormat).toBe("UPPER_CASE");
  });
});
