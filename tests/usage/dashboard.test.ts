import { describe, it, expect } from "vitest";
import { buildDashboard } from "@/lib/usage/dashboard";
import type { UsageRow } from "@/lib/usage/aggregate";

const rows: UsageRow[] = [
  { space_id: "s1", provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 100, cost_usd: 0.01, created_at: "2026-06-16T01:00:00Z" },
  { space_id: "s1", provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", total_tokens: 50, cost_usd: null, created_at: "2026-06-16T02:00:00Z" },
  { space_id: "s2", provider: "deepseek", model: "deepseek-v4-flash", operation: "production", total_tokens: 200, cost_usd: 0.05, created_at: "2026-06-16T03:00:00Z" },
];

describe("buildDashboard", () => {
  it("returns zeroed totals + empty tables for no rows", () => {
    const d = buildDashboard([], { scope: { kind: "space", spaceId: "s1" }, spaceNames: {} });
    expect(d.totals).toEqual({ totalCostUsd: 0, totalTokens: 0, calls: 0, hasUnpricedRows: false });
    expect(d.byProviderModel).toEqual([]);
    expect(d.bySpace).toBeNull();
  });

  it("space scope: sums totals, builds provider/model rows desc by cost, no bySpace", () => {
    const d = buildDashboard(rows, { scope: { kind: "space", spaceId: "s1" }, spaceNames: {} });
    expect(d.totals.totalTokens).toBe(350);
    expect(d.totals.totalCostUsd).toBeCloseTo(0.06, 10);
    expect(d.totals.calls).toBe(3);
    expect(d.totals.hasUnpricedRows).toBe(true);
    expect(d.byProviderModel[0]).toMatchObject({ provider: "deepseek", model: "deepseek-v4-flash", calls: 2 });
    expect(d.byProviderModel[0].costUsd).toBeCloseTo(0.06, 10);
    expect(d.bySpace).toBeNull();
  });

  it("owner scope: builds bySpace with names, falls back to id when name missing", () => {
    const d = buildDashboard(rows, { scope: { kind: "owner" }, spaceNames: { s1: "Alpha" } });
    expect(d.bySpace).not.toBeNull();
    const s1 = d.bySpace!.find((r) => r.spaceId === "s1");
    const s2 = d.bySpace!.find((r) => r.spaceId === "s2");
    expect(s1).toMatchObject({ spaceName: "Alpha", tokens: 150, calls: 2 });
    expect(s2).toMatchObject({ spaceName: "s2", tokens: 200, calls: 1 });
    expect(d.bySpace![0].costUsd).toBeGreaterThanOrEqual(d.bySpace![1].costUsd);
  });
});
