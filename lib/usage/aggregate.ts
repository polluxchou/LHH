import type { Provider } from "@/lib/usage/pricing";
import type { UsageOperation } from "@/lib/usage/record";

export interface UsageRow {
  space_id: string | null;
  provider: Provider;
  model: string;
  operation: UsageOperation;
  total_tokens: number;
  cost_usd: number | null;
  created_at: string;
}

export type GroupDim = "provider" | "model" | "operation" | "day" | "space";

export interface UsageGroup {
  key: Partial<Record<GroupDim, string>>;
  totalTokens: number;
  totalCostUsd: number;
  calls: number;
}

function dimValue(row: UsageRow, dim: GroupDim): string {
  if (dim === "day") return row.created_at.slice(0, 10);
  if (dim === "space") return row.space_id ?? "";
  return String(row[dim]);
}

/** 纯聚合：对已取出的行按维度分组求和。读库由后续报表 UI 负责。 */
export function aggregateRows(rows: UsageRow[], groupBy: GroupDim[]): UsageGroup[] {
  const map = new Map<string, UsageGroup>();
  for (const row of rows) {
    const key: Partial<Record<GroupDim, string>> = {};
    for (const dim of groupBy) key[dim] = dimValue(row, dim);
    const id = groupBy.map((d) => key[d]).join("|");
    let g = map.get(id);
    if (!g) {
      g = { key, totalTokens: 0, totalCostUsd: 0, calls: 0 };
      map.set(id, g);
    }
    g.totalTokens += row.total_tokens;
    g.totalCostUsd += row.cost_usd ?? 0;
    g.calls += 1;
  }
  return [...map.values()];
}
