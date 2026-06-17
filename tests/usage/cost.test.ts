import { describe, it, expect } from "vitest";
import { computeCost } from "@/lib/usage/cost";

describe("computeCost", () => {
  it("computes standard cost (no cache)", () => {
    // deepseek-v4-flash: 0.14 / 0.28 per 1M
    const r = computeCost("deepseek", "deepseek-v4-flash", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    expect(r).not.toBeNull();
    expect(r!.inputPricePer1M).toBe(0.14);
    expect(r!.outputPricePer1M).toBe(0.28);
    expect(r!.costUsd).toBeCloseTo(0.42, 10); // 0.14 + 0.28
    expect(r!.currency).toBe("USD");
  });

  it("applies cached input rate to the cached portion", () => {
    // 1M prompt of which 1M cached → all input at 0.0028, 0 output
    const r = computeCost("deepseek", "deepseek-v4-flash", {
      promptTokens: 1_000_000,
      completionTokens: 0,
      totalTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
    });
    expect(r!.costUsd).toBeCloseTo(0.0028, 10);
  });

  it("returns null for unknown model (caller still keeps token counts)", () => {
    expect(computeCost("gemini", "nope", { promptTokens: 10, completionTokens: 5, totalTokens: 15 })).toBeNull();
  });
});
