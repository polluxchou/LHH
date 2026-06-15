import type { ContentValueScore } from "./types";

export type ScoreInput = Pick<
  ContentValueScore,
  | "freshnessScore"
  | "importanceScore"
  | "rarityScore"
  | "audienceInterestScore"
  | "visualPotentialScore"
  | "riskScore"
>;

export function validateScoreValue(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

export function getOverallRecommendation(score: ScoreInput): ContentValueScore["overallRecommendation"] {
  if (score.riskScore >= 5) {
    return "weak";
  }

  const editorialAverage =
    (score.freshnessScore +
      score.importanceScore +
      score.rarityScore +
      score.audienceInterestScore +
      score.visualPotentialScore) /
    5;

  if (editorialAverage >= 4 && score.riskScore <= 3) {
    return "strong";
  }

  if (editorialAverage >= 3 && score.riskScore <= 4) {
    return "medium";
  }

  return "weak";
}
