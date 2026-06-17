import type { SupabaseClient } from "@supabase/supabase-js";
import { runIngestForBrand, type PipelineDeps } from "@/lib/ingest/pipeline";
import { searchRecentNews } from "@/lib/ingest/gemini-search";
import { analyzeBrief } from "@/lib/ingest/deepseek-analyze";
import { writeIngestResult } from "@/lib/db/ingest-writer";
import { recordUsage } from "@/lib/usage/record";

/** 单对象按需抓取的入参(与 pipeline 的 BrandInput 同形状)。 */
export interface IngestBrandInput {
  id: string;
  /** 该监控对象所属空间;writer 会据此 stamp 到 search_runs/signals/briefs/scores。 */
  spaceId: string;
  name: string;
  aliases: string[];
  keywords: string[];
  excludedTerms: string[];
  languages: string[];
  regions: string[];
}

/**
 * 便捷封装:对单个监控对象按需跑完整流水线(Gemini grounding → DeepSeek → 写库)。
 *
 * - `db` 必须是 **service-role** 客户端(写库需绕过 RLS)。
 *   `lib/db/supabase.ts` 的 `getServiceClient()` 或账号层 `lib/supabase/admin.ts` 的
 *   `createSupabaseAdminClient()` 均可——writer 对传入 client 无特殊预期,只用标准
 *   `from().insert/upsert/select`。
 * - 默认 `windowDays=7`;`seenCanonicalUrls` 为空集,即**不做跨运行去重**(让工作台手动
 *   点击可重新搜同一对象)。
 * - 返回值原样透传 writer 的 `{ wrote, reason? }`,可直接进 runLog。
 *
 * 内部接口稳定:调用方只依赖此函数签名,不依赖 `PipelineDeps` 内部形状。
 */
export async function ingestTrackingObject(
  db: SupabaseClient,
  brand: IngestBrandInput,
  opts?: { now?: string; windowDays?: number },
): Promise<{ wrote: boolean; reason?: string }> {
  const deps: PipelineDeps = {
    now: opts?.now ?? new Date().toISOString(),
    windowDays: opts?.windowDays ?? 7,
    seenCanonicalUrls: new Set<string>(),
    search: (b, since, today, keywords, excludedTerms) =>
      searchRecentNews(
        { brand: b, sinceDate: since, todayDate: today, keywords, excludedTerms },
        (e) => void recordUsage({ ...e, operation: "ingest_search", spaceId: brand.spaceId }),
      ),
    analyze: (b, items) =>
      analyzeBrief(
        { brand: b, items },
        (e) => void recordUsage({ ...e, operation: "ingest_analyze", spaceId: brand.spaceId }),
      ),
  };
  const result = await runIngestForBrand(brand, deps);
  return writeIngestResult(db, result);
}
