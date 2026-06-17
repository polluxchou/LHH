import { describe, it, expect, vi } from "vitest";
import { recordUsage } from "@/lib/usage/record";

describe("recordUsage", () => {
  it("inserts a row with price + cost snapshot", async () => {
    const rows: Record<string, unknown>[] = [];
    await recordUsage(
      {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        operation: "article",
        usage: { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
        spaceId: "space-1",
      },
      { insert: async (row) => { rows.push(row); } },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      space_id: "space-1",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      operation: "article",
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
      input_price_per_1m: 0.14,
      output_price_per_1m: 0.28,
      status: "success",
    });
    expect(rows[0].cost_usd).toBeCloseTo(0.42, 10);
  });

  it("no-ops when usage is null", async () => {
    const insert = vi.fn();
    await recordUsage(
      { provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", usage: null },
      { insert },
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("swallows insert errors (never throws into the caller flow)", async () => {
    await expect(
      recordUsage(
        { provider: "deepseek", model: "deepseek-v4-flash", operation: "production", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        { insert: async () => { throw new Error("db down"); } },
      ),
    ).resolves.toBeUndefined();
  });

  it("stores null cost for unknown model but keeps token counts", async () => {
    const rows: Record<string, unknown>[] = [];
    await recordUsage(
      { provider: "gemini", model: "ghost-model", operation: "ingest_search", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
      { insert: async (row) => { rows.push(row); } },
    );
    expect(rows[0]).toMatchObject({ cost_usd: null, prompt_tokens: 10, total_tokens: 15 });
  });
});
