import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeCost } from "@/lib/usage/cost";
import type { Provider } from "@/lib/usage/pricing";
import type { TokenUsage } from "@/lib/usage/extract";

export type UsageOperation = "ingest_search" | "ingest_analyze" | "article" | "production";

export interface RecordUsageInput {
  provider: Provider;
  model: string;
  operation: UsageOperation;
  usage: TokenUsage | null;
  spaceId?: string | null;
  userId?: string | null;
  status?: "success" | "error";
}

export interface RecordUsageDeps {
  insert: (row: Record<string, unknown>) => Promise<void>;
}

function defaultDeps(): RecordUsageDeps {
  return {
    insert: async (row) => {
      const db = createSupabaseAdminClient();
      const { error } = await db.from("usage_logs").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}

/** 落一行用量记录。整体 try/catch：记录失败仅告警，绝不影响用户生成主流程。 */
export async function recordUsage(input: RecordUsageInput, deps: RecordUsageDeps = defaultDeps()): Promise<void> {
  try {
    if (!input.usage) return; // 无 usage（SDK 未返回）则跳过
    const cost = computeCost(input.provider, input.model, input.usage);
    await deps.insert({
      space_id: input.spaceId ?? null,
      user_id: input.userId ?? null,
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      prompt_tokens: input.usage.promptTokens,
      completion_tokens: input.usage.completionTokens,
      total_tokens: input.usage.totalTokens,
      cached_input_tokens: input.usage.cachedInputTokens ?? null,
      input_price_per_1m: cost?.inputPricePer1M ?? null,
      output_price_per_1m: cost?.outputPricePer1M ?? null,
      cost_usd: cost?.costUsd ?? null,
      currency: "USD",
      status: input.status ?? "success",
    });
  } catch (e) {
    console.warn("recordUsage failed (ignored):", (e as Error).message);
  }
}
