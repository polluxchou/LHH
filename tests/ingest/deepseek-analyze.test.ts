import { describe, it, expect } from "vitest";
import { analyzeBrief, buildAnalyzePrompt, parseAnalysis } from "@/lib/ingest/deepseek-analyze";

describe("buildAnalyzePrompt", () => {
  it("mentions json and includes item titles", () => {
    const p = buildAnalyzePrompt("SpaceX", [
      { title: "Starship flew", url: "u", publishedDate: "2026-06-14", summary: "s" },
    ]);
    expect(p.toLowerCase()).toContain("json");
    expect(p).toContain("Starship flew");
  });
});

describe("parseAnalysis", () => {
  it("parses valid analysis json", () => {
    const json = JSON.stringify({
      signalType: "technical_project_milestone",
      headline: "h", summary: "s", eventDate: "2026-06-14", confidence: 0.8,
      briefTitle: "bt", factSummary: "fs", whyItMatters: "w",
      possibleAngles: ["a"], openQuestions: ["q"], riskNotes: ["r"],
      score: {
        freshnessScore: 5, importanceScore: 4, rarityScore: 3,
        audienceInterestScore: 4, visualPotentialScore: 5, riskScore: 2,
        overallRecommendation: "strong", scoringNotes: "n",
      },
    });
    const a = parseAnalysis(json);
    expect(a?.signalType).toBe("technical_project_milestone");
    expect(a?.score.freshnessScore).toBe(5);
  });

  it("returns null on invalid signalType", () => {
    expect(parseAnalysis(JSON.stringify({ signalType: "bogus" }))).toBeNull();
  });

  it("returns null on non-json", () => {
    expect(parseAnalysis("oops")).toBeNull();
  });

  it("returns null when required text fields are blank", () => {
    const json = JSON.stringify({ signalType: "policy_regulatory_change", headline: "", summary: "", factSummary: "", whyItMatters: "", score: {} });
    expect(parseAnalysis(json)).toBeNull();
  });

  it("returns null when score object is missing", () => {
    const json = JSON.stringify({ signalType: "policy_regulatory_change", headline: "h", summary: "s", factSummary: "f", whyItMatters: "w" });
    expect(parseAnalysis(json)).toBeNull();
  });
});

describe("analyzeBrief onUsage", () => {
  const validJson = JSON.stringify({
    signalType: "technical_project_milestone",
    headline: "h", summary: "s", eventDate: "2026-06-14", confidence: 0.8,
    briefTitle: "bt", factSummary: "fs", whyItMatters: "w",
    possibleAngles: ["a"], openQuestions: ["q"], riskNotes: ["r"],
    score: { freshnessScore: 5, importanceScore: 4, rarityScore: 3, audienceInterestScore: 4, visualPotentialScore: 5, riskScore: 2, overallRecommendation: "strong", scoringNotes: "n" },
  });

  it("forwards usage with deepseek provider+model", async () => {
    const events: unknown[] = [];
    const a = await analyzeBrief(
      { brand: "SpaceX", items: [{ title: "t", url: "u", publishedDate: "2026-06-14", summary: "s" }] },
      (e) => events.push(e),
      { complete: async () => ({ text: validJson, usage: { promptTokens: 500, completionTokens: 120, totalTokens: 620 } }) },
    );
    expect(a?.headline).toBe("h");
    expect(events).toEqual([
      { provider: "deepseek", model: "deepseek-v4-flash", usage: { promptTokens: 500, completionTokens: 120, totalTokens: 620 } },
    ]);
  });
});
