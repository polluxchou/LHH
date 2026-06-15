import { describe, expect, it } from "vitest";
import { getOverallRecommendation, validateScoreValue } from "@/lib/domain/scoring";

describe("content value scoring", () => {
  it("accepts score values from 1 through 5", () => {
    expect(validateScoreValue(1)).toBe(true);
    expect(validateScoreValue(3)).toBe(true);
    expect(validateScoreValue(5)).toBe(true);
  });

  it("rejects score values outside the 1 through 5 range", () => {
    expect(validateScoreValue(0)).toBe(false);
    expect(validateScoreValue(6)).toBe(false);
    expect(validateScoreValue(2.5)).toBe(false);
  });

  it("recommends strong when editorial value is high and risk is manageable", () => {
    expect(
      getOverallRecommendation({
        freshnessScore: 5,
        importanceScore: 5,
        rarityScore: 4,
        audienceInterestScore: 4,
        visualPotentialScore: 5,
        riskScore: 2,
      }),
    ).toBe("strong");
  });

  it("recommends weak when risk is high even if the signal is interesting", () => {
    expect(
      getOverallRecommendation({
        freshnessScore: 5,
        importanceScore: 5,
        rarityScore: 4,
        audienceInterestScore: 5,
        visualPotentialScore: 5,
        riskScore: 5,
      }),
    ).toBe("weak");
  });
});
