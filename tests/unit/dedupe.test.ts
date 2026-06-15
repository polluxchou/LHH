import { describe, expect, it } from "vitest";
import { canonicalizeUrl, dedupeByCanonicalUrl, dedupeByTrackingObjectKey } from "@/lib/search/dedupe";

describe("search dedupe", () => {
  it("canonicalizes URLs by removing fragments, tracking params, and trailing slash noise", () => {
    expect(
      canonicalizeUrl("HTTPS://Example.com:443/articles/launch/?utm_source=feed&utm_campaign=daily#section"),
    ).toBe("example.com/articles/launch");
    expect(canonicalizeUrl("https://example.com/articles/launch?ref=twitter")).toBe(
      "example.com/articles/launch",
    );
    expect(canonicalizeUrl("https://example.com/search?b=2&a=1")).toBe("example.com/search?a=1&b=2");
  });

  it("keeps the first result for duplicate canonical URLs", () => {
    const results = [
      { id: "first", url: "https://example.com/report?utm_source=newsletter#top" },
      { id: "duplicate", url: "http://example.com/report/" },
      { id: "other", url: "https://example.com/other" },
    ];

    expect(dedupeByCanonicalUrl(results).map((result) => result.id)).toEqual(["first", "other"]);
  });

  it("dedupes candidate-like records by tracking object and dedupe key", () => {
    const records = [
      { id: "stoke-a", trackingObjectId: "tracking-stoke-space", dedupeKey: "hot-fire" },
      { id: "stoke-b", trackingObjectId: "tracking-stoke-space", dedupeKey: "hot-fire" },
      { id: "starbase-a", trackingObjectId: "tracking-starbase", dedupeKey: "hot-fire" },
    ];

    expect(dedupeByTrackingObjectKey(records).map((record) => record.id)).toEqual([
      "stoke-a",
      "starbase-a",
    ]);
  });
});
