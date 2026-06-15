import { describe, it, expect } from "vitest";
import { runIngestForBrand } from "@/lib/ingest/pipeline";
import { canonicalizeUrl } from "@/lib/search/dedupe";
import type { GeminiNewsItem, AnalyzedBrief } from "@/lib/ingest/types";

const analyzed: AnalyzedBrief = {
  signalType: "technical_project_milestone", headline: "h", summary: "s",
  eventDate: "2026-06-14", confidence: 0.9, briefTitle: "bt", factSummary: "fs",
  whyItMatters: "w", possibleAngles: [], openQuestions: [], riskNotes: [],
  score: { freshnessScore: 5, importanceScore: 4, rarityScore: 3, audienceInterestScore: 4, visualPotentialScore: 5, riskScore: 2, overallRecommendation: "strong", scoringNotes: "n" },
};

const brand = { id: "uuid-1", name: "SpaceX", aliases: [], keywords: [], excludedTerms: [], languages: [], regions: [] };

it("filters stale, dedupes, then analyzes", async () => {
  const items: GeminiNewsItem[] = [
    { title: "fresh", url: "https://a/1", publishedDate: "2026-06-14", summary: "" },
    { title: "dup", url: "https://a/1?utm=x", publishedDate: "2026-06-14", summary: "" },
    { title: "stale", url: "https://a/2", publishedDate: "2026-01-01", summary: "" },
  ];
  let analyzedWith: GeminiNewsItem[] = [];
  const res = await runIngestForBrand(brand, {
    now: "2026-06-15T00:00:00.000Z",
    windowDays: 7,
    search: async () => items,
    analyze: async (b, its) => { analyzedWith = its; return analyzed; },
  });
  expect(res.freshItems.map((i) => i.url)).toEqual(["https://a/1"]);
  expect(analyzedWith).toHaveLength(1);
  expect(res.analyzed?.headline).toBe("h");
});

it("skips analysis when no fresh items", async () => {
  const res = await runIngestForBrand(brand, {
    now: "2026-06-15T00:00:00.000Z", windowDays: 7,
    search: async () => [{ title: "stale", url: "https://a/9", publishedDate: "2026-01-01", summary: "" }],
    analyze: async () => analyzed,
  });
  expect(res.freshItems).toEqual([]);
  expect(res.analyzed).toBeNull();
});

it("drops items already seen in previous runs (cross-run dedup) before analyzing", async () => {
  let analyzeCalled = false;
  const res = await runIngestForBrand(brand, {
    now: "2026-06-15T00:00:00.000Z", windowDays: 7,
    seenCanonicalUrls: new Set([canonicalizeUrl("https://a/1")]),
    search: async () => [
      { title: "seen-yesterday", url: "https://a/1", publishedDate: "2026-06-14", summary: "" },
    ],
    analyze: async () => { analyzeCalled = true; return analyzed; },
  });
  expect(res.freshItems).toEqual([]);
  expect(res.analyzed).toBeNull();
  expect(analyzeCalled).toBe(false);
});
