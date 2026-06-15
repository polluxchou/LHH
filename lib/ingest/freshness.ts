import type { GeminiNewsItem } from "@/lib/ingest/types";

/**
 * 仅保留 publishedDate 落在 [now - windowDays, now] 的条目。
 * 无日期或未来日期一律丢弃（无法证明新鲜 / 多半是解析错误）。
 */
export function filterFreshItems(
  items: readonly GeminiNewsItem[],
  nowISO: string,
  windowDays: number,
): GeminiNewsItem[] {
  const now = new Date(nowISO).getTime();
  const lower = now - windowDays * 24 * 60 * 60 * 1000;
  return items.filter((it) => {
    if (!it.publishedDate) return false;
    const t = new Date(it.publishedDate).getTime();
    if (Number.isNaN(t)) return false;
    return t >= lower && t <= now;
  });
}
