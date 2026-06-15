import type { TrackingObject } from "@/lib/domain/types";
import type { GeminiNewsItem, AnalyzedBrief, IngestResult } from "@/lib/ingest/types";
import { filterFreshItems } from "@/lib/ingest/freshness";
import { canonicalizeUrl, dedupeByCanonicalUrl } from "@/lib/search/dedupe";
import { buildTrackingObjectQueries } from "@/lib/search/query-builder";

export interface PipelineDeps {
  now: string;
  windowDays: number;
  /** 以往运行已处理过的 canonical url 集合，用于跨运行去重（分析前过滤，避免重复调用 DeepSeek） */
  seenCanonicalUrls?: Set<string>;
  search: (brand: string, sinceDate: string, todayDate: string) => Promise<GeminiNewsItem[]>;
  analyze: (brand: string, items: GeminiNewsItem[]) => Promise<AnalyzedBrief | null>;
}

type BrandInput = Pick<
  TrackingObject,
  "id" | "name" | "aliases" | "keywords" | "excludedTerms" | "languages" | "regions"
>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runIngestForBrand(
  brand: BrandInput,
  deps: PipelineDeps,
): Promise<IngestResult> {
  const today = isoDate(new Date(deps.now));
  const since = isoDate(new Date(new Date(deps.now).getTime() - deps.windowDays * 86400000));
  const querySet = buildTrackingObjectQueries(brand as TrackingObject);

  const raw = await deps.search(brand.name, since, today);
  // 窗口过滤 → 运行内去重 → 跨运行去重（剔掉以往已处理过的）
  const withinRun = dedupeByCanonicalUrl(filterFreshItems(raw, deps.now, deps.windowDays));
  const seen = deps.seenCanonicalUrls ?? new Set<string>();
  const fresh = withinRun.filter((it) => !seen.has(canonicalizeUrl(it.url)));
  const analyzed = fresh.length > 0 ? await deps.analyze(brand.name, fresh) : null;

  return { trackingObjectId: brand.id, querySet, freshItems: fresh, analyzed };
}
