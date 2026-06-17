import { describe, it, expect } from "vitest";
import { getModelPrice, PRICING } from "@/lib/usage/pricing";

describe("getModelPrice", () => {
  it("returns real price for an active model", () => {
    const p = getModelPrice("deepseek", "deepseek-v4-flash");
    expect(p).toEqual({ inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.0028, currency: "USD" });
  });

  it("covers all four providers in the table", () => {
    expect(Object.keys(PRICING).sort()).toEqual(["claude", "codex", "deepseek", "gemini"]);
  });

  it("returns null for unknown model", () => {
    expect(getModelPrice("gemini", "made-up-model")).toBeNull();
  });
});
