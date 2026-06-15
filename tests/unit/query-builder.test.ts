import { describe, expect, it } from "vitest";
import { buildTrackingObjectQueries } from "@/lib/search/query-builder";
import type { TrackingObject } from "@/lib/domain/types";

const baseTrackingObject: TrackingObject = {
  id: "tracking-example",
  name: "Stoke Space",
  type: "company",
  aliases: ["Stoke", "Stoke Space Technologies"],
  countryOrRegion: "United States",
  officialUrl: "https://www.stokespace.com",
  primaryTrack: "launch",
  whyTrack: "Reusable launch vehicle startup with technical milestone and test-site signals.",
  keywords: ["Stoke Space", "reusable rocket", "Nova launch vehicle", "engine test"],
  excludedTerms: ["funding round", "hiring event"],
  languages: ["en"],
  regions: ["United States"],
  preferredSources: ["official", "regulator", "trade_media"],
  searchFrequency: "daily",
  priority: 1,
  createdAt: "2026-06-07T00:00:00.000Z",
  updatedAt: "2026-06-07T00:00:00.000Z",
};

describe("tracking object query builder", () => {
  it("builds deterministic queries from identity, keywords, exclusions, languages, and regions", () => {
    const queries = buildTrackingObjectQueries(baseTrackingObject);

    expect(queries).toEqual([
      '"Stoke Space" ("Stoke Space" OR "reusable rocket" OR "Nova launch vehicle" OR "engine test") lang:en region:"United States" -"funding round" -"hiring event"',
      '"Stoke" ("Stoke Space" OR "reusable rocket" OR "Nova launch vehicle" OR "engine test") lang:en region:"United States" -"funding round" -"hiring event"',
      '"Stoke Space Technologies" ("Stoke Space" OR "reusable rocket" OR "Nova launch vehicle" OR "engine test") lang:en region:"United States" -"funding round" -"hiring event"',
    ]);
  });

  it("normalizes empty and duplicate query inputs without changing field order", () => {
    const object: TrackingObject = {
      ...baseTrackingObject,
      name: "  Example Launch  ",
      aliases: ["Example Launch", "EL", "  "],
      keywords: ["orbital test", "orbital test", "permit"],
      excludedTerms: ["funding", "funding", ""],
      languages: ["en", "es", "en"],
      regions: ["United States", "Mexico", "United States"],
    };

    expect(buildTrackingObjectQueries(object)).toEqual([
      '"Example Launch" ("orbital test" OR "permit") lang:en lang:es region:"United States" region:"Mexico" -funding',
      '"EL" ("orbital test" OR "permit") lang:en lang:es region:"United States" region:"Mexico" -funding',
    ]);
  });
});
