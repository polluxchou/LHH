import { describe, it, expect } from "vitest";
import { filterFreshItems } from "@/lib/ingest/freshness";
import type { GeminiNewsItem } from "@/lib/ingest/types";

const item = (url: string, publishedDate: string | null): GeminiNewsItem => ({
  title: url,
  url,
  publishedDate,
  summary: "",
});

describe("filterFreshItems", () => {
  const now = "2026-06-15T00:00:00.000Z";

  it("keeps items within the window", () => {
    const items = [item("a", "2026-06-10"), item("b", "2026-06-14")];
    expect(filterFreshItems(items, now, 7).map((i) => i.url)).toEqual(["a", "b"]);
  });

  it("drops items older than the window", () => {
    const items = [item("old", "2026-06-01"), item("ok", "2026-06-12")];
    expect(filterFreshItems(items, now, 7).map((i) => i.url)).toEqual(["ok"]);
  });

  it("drops items with no publishedDate (cannot prove freshness)", () => {
    expect(filterFreshItems([item("x", null)], now, 7)).toEqual([]);
  });

  it("drops future-dated items (likely parse error)", () => {
    expect(filterFreshItems([item("future", "2026-07-01")], now, 7)).toEqual([]);
  });
});
