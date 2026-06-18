import type { Provider } from "@/lib/usage/pricing";
import { aggregateRows, type UsageRow } from "@/lib/usage/aggregate";

export type UsageScope =
  | { kind: "space"; spaceId: string }
  | { kind: "owner" };

export interface UsageTotals {
  totalCostUsd: number;
  totalTokens: number;
  calls: number;
  hasUnpricedRows: boolean;
}

export interface ProviderModelRow {
  provider: Provider;
  model: string;
  costUsd: number;
  tokens: number;
  calls: number;
}

export interface SpaceUsageRow {
  spaceId: string;
  spaceName: string;
  costUsd: number;
  tokens: number;
  calls: number;
}

export interface UsageDashboardData {
  scope: UsageScope;
  totals: UsageTotals;
  byProviderModel: ProviderModelRow[];
  bySpace: SpaceUsageRow[] | null;
}

/** 纯函数:把已取出的 usage 行塑形成仪表盘数据。不触网、可单测。 */
export function buildDashboard(
  rows: UsageRow[],
  ctx: { scope: UsageScope; spaceNames: Record<string, string> },
): UsageDashboardData {
  const totals: UsageTotals = { totalCostUsd: 0, totalTokens: 0, calls: rows.length, hasUnpricedRows: false };
  for (const r of rows) {
    totals.totalTokens += r.total_tokens;
    totals.totalCostUsd += r.cost_usd ?? 0;
    if (r.cost_usd === null) totals.hasUnpricedRows = true;
  }

  const byProviderModel: ProviderModelRow[] = aggregateRows(rows, ["provider", "model"])
    .map((g) => ({
      provider: g.key.provider as Provider,
      model: g.key.model ?? "",
      costUsd: g.totalCostUsd,
      tokens: g.totalTokens,
      calls: g.calls,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  let bySpace: SpaceUsageRow[] | null = null;
  if (ctx.scope.kind === "owner") {
    bySpace = aggregateRows(rows, ["space"])
      .map((g) => {
        const spaceId = g.key.space ?? "";
        return {
          spaceId,
          spaceName: ctx.spaceNames[spaceId] ?? spaceId,
          costUsd: g.totalCostUsd,
          tokens: g.totalTokens,
          calls: g.calls,
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);
  }

  return { scope: ctx.scope, totals, byProviderModel, bySpace };
}
