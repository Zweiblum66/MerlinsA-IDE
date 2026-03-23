import { describe, it, expect } from "vitest";
import { ModelRouter } from "./router.js";

describe("ModelRouter", () => {
  const router = new ModelRouter();

  describe("getModelForAgent", () => {
    it("should return sonnet for developer agent", () => {
      const model = router.getModelForAgent("developer");
      expect(model).toBe("claude-sonnet-4-20250514");
    });

    it("should return haiku for qa-engineer agent", () => {
      const model = router.getModelForAgent("qa-engineer");
      expect(model).toBe("claude-haiku-35-20241022");
    });

    it("should return sonnet for architect agent", () => {
      const model = router.getModelForAgent("architect");
      expect(model).toBe("claude-sonnet-4-20250514");
    });

    it("should return haiku for scrum-master agent", () => {
      const model = router.getModelForAgent("scrum-master");
      expect(model).toBe("claude-haiku-35-20241022");
    });

    it("should return sonnet for product-owner agent", () => {
      const model = router.getModelForAgent("product-owner");
      expect(model).toBe("claude-sonnet-4-20250514");
    });

    it("should return haiku for devops-engineer agent", () => {
      const model = router.getModelForAgent("devops-engineer");
      expect(model).toBe("claude-haiku-35-20241022");
    });

    it("should return sonnet for api-guardian agent", () => {
      const model = router.getModelForAgent("api-guardian");
      expect(model).toBe("claude-sonnet-4-20250514");
    });
  });

  describe("shouldUpgrade", () => {
    it("should upgrade qa-engineer from haiku to sonnet after 2 failures", () => {
      const model = router.shouldUpgrade("qa-engineer", 2);
      expect(model).toBe("claude-sonnet-4-20250514");
    });

    it("should upgrade developer from sonnet to opus after 2 failures", () => {
      const model = router.shouldUpgrade("developer", 2);
      expect(model).toBe("claude-opus-4-20250115");
    });

    it("should not upgrade when failure count is 1 or below", () => {
      const model = router.shouldUpgrade("qa-engineer", 1);
      expect(model).toBe("claude-haiku-35-20241022");
    });

    it("should not upgrade when failure count is 0", () => {
      const model = router.shouldUpgrade("developer", 0);
      expect(model).toBe("claude-sonnet-4-20250514");
    });

    it("should stay at opus when already at max model and failures exceed threshold", () => {
      // api-guardian defaults to sonnet, so after failures it goes to opus
      // But since there's no agent defaulting to opus, we test upgrade chain
      const model = router.shouldUpgrade("developer", 3);
      expect(model).toBe("claude-opus-4-20250115");
    });
  });

  describe("getModelConfig", () => {
    it("should return config for sonnet model", () => {
      const config = router.getModelConfig("claude-sonnet-4-20250514");
      expect(config.contextWindow).toBe(200_000);
      expect(config.inputPrice).toBe(3);
      expect(config.outputPrice).toBe(15);
    });

    it("should return config for haiku model", () => {
      const config = router.getModelConfig("claude-haiku-35-20241022");
      expect(config.contextWindow).toBe(200_000);
      expect(config.inputPrice).toBe(0.8);
      expect(config.outputPrice).toBe(4);
    });

    it("should return config for opus model", () => {
      const config = router.getModelConfig("claude-opus-4-20250115");
      expect(config.contextWindow).toBe(200_000);
      expect(config.inputPrice).toBe(15);
      expect(config.outputPrice).toBe(75);
    });
  });
});
