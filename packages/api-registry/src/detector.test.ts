import { describe, it, expect } from "vitest";
import { DriftDetector } from "./detector.js";

describe("DriftDetector", () => {
  const detector = new DriftDetector();

  it("should detect breaking change when a required field is removed", () => {
    const registered = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["id", "name", "email"],
    };

    const actual = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        // email removed
      },
      required: ["id", "name"],
    };

    const report = detector.compareSchemas(registered, actual);
    expect(report.hasDrift).toBe(true);
    expect(report.breakingChanges.length).toBeGreaterThan(0);

    const emailChange = report.breakingChanges.find((c) => c.fieldPath === "email");
    expect(emailChange).toBeDefined();
    expect(emailChange!.changeType).toBe("removed");
    expect(emailChange!.isBreaking).toBe(true);
  });

  it("should detect breaking change when a new required field is added", () => {
    const registered = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    };

    const actual = {
      type: "object",
      properties: {
        id: { type: "string" },
        role: { type: "string" },
      },
      required: ["id", "role"],
    };

    const report = detector.compareSchemas(registered, actual);
    expect(report.hasDrift).toBe(true);
    expect(report.breakingChanges.length).toBeGreaterThan(0);

    const roleChange = report.breakingChanges.find((c) => c.fieldPath === "role");
    expect(roleChange).toBeDefined();
    expect(roleChange!.changeType).toBe("added");
    expect(roleChange!.isBreaking).toBe(true);
  });

  it("should detect breaking change when field type changes", () => {
    const registered = {
      type: "object",
      properties: {
        count: { type: "number" },
      },
    };

    const actual = {
      type: "object",
      properties: {
        count: { type: "string" },
      },
    };

    const report = detector.compareSchemas(registered, actual);
    expect(report.hasDrift).toBe(true);
    expect(report.breakingChanges.length).toBeGreaterThan(0);

    const countChange = report.breakingChanges.find((c) => c.fieldPath === "count");
    expect(countChange).toBeDefined();
    expect(countChange!.changeType).toBe("typeChanged");
    expect(countChange!.oldType).toBe("number");
    expect(countChange!.newType).toBe("string");
  });

  it("should detect new optional field as non-breaking", () => {
    const registered = {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
    };

    const actual = {
      type: "object",
      properties: {
        id: { type: "string" },
        nickname: { type: "string" },
      },
      required: ["id"],
    };

    const report = detector.compareSchemas(registered, actual);
    expect(report.hasDrift).toBe(true);
    expect(report.breakingChanges).toHaveLength(0);
    expect(report.nonBreakingChanges.length).toBeGreaterThan(0);

    const nicknameChange = report.nonBreakingChanges.find((c) => c.fieldPath === "nickname");
    expect(nicknameChange).toBeDefined();
    expect(nicknameChange!.changeType).toBe("added");
    expect(nicknameChange!.isBreaking).toBe(false);
  });

  it("should report no drift for identical schemas", () => {
    const schemaObj = {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "name"],
    };

    const report = detector.compareSchemas(schemaObj, schemaObj);
    expect(report.hasDrift).toBe(false);
    expect(report.breakingChanges).toHaveLength(0);
    expect(report.nonBreakingChanges).toHaveLength(0);
  });
});
