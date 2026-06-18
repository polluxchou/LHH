import { describe, it, expect } from "vitest";
import { aggregateRows, type UsageRow } from "@/lib/usage/aggregate";

const rows: UsageRow[] = [
  { space_id: "s1", provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 100, cost_usd: 0.01, created_at: "2026-06-16T01:00:00Z" },
  { space_id: "s1", provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 200, cost_usd: 0.02, created_at: "2026-06-16T05:00:00Z" },
  { space_id: "s2", provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", total_tokens: 50, cost_usd: null, created_at: "2026-06-16T02:00:00Z" },
];

describe("aggregateRows", () => {
  it("groups by provider and sums tokens + cost (null cost treated as 0)", () => {
    const out = aggregateRows(rows, ["provider"]);
    const ds = out.find((g) => g.key.provider === "deepseek");
    expect(ds).toMatchObject({ totalTokens: 300, totalCostUsd: 0.03, calls: 2 });
    const gm = out.find((g) => g.key.provider === "gemini");
    expect(gm).toMatchObject({ totalTokens: 50, totalCostUsd: 0, calls: 1 });
  });

  it("groups by provider + day", () => {
    const out = aggregateRows(rows, ["provider", "day"]);
    const ds = out.find((g) => g.key.provider === "deepseek" && g.key.day === "2026-06-16");
    expect(ds?.calls).toBe(2);
  });

  it("groups by space", () => {
    const out = aggregateRows(rows, ["space"]);
    const s1 = out.find((g) => g.key.space === "s1");
    const s2 = out.find((g) => g.key.space === "s2");
    expect(s1).toMatchObject({ totalTokens: 300, totalCostUsd: 0.03, calls: 2 });
    expect(s2).toMatchObject({ totalTokens: 50, totalCostUsd: 0, calls: 1 });
  });
});
