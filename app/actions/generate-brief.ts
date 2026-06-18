"use server";

import { analyzeBrief } from "@/lib/ingest/deepseek-analyze";
import { recordUsage } from "@/lib/usage/record";
import type { AnalyzedBrief, GeminiNewsItem } from "@/lib/ingest/types";
import { verifyOnX } from "@/lib/ingest/x-verify";
import type { Verification } from "@/lib/domain/types";

export type GenerateBriefResult =
  | { ok: true; analyzed: AnalyzedBrief; verification: Verification }
  | { ok: false; reason: string };

/**
 * 点击「生成简报」时实时调用 DeepSeek，把候选信号 + 其来源综合成 factSummary/whyItMatters 等。
 * 与摄取管线同一套 analyzeBrief；服务端运行（DeepSeek key 不出后端）。失败由调用方回退模板。
 */
export async function generateBriefAction(input: {
  brand: string;
  signal: { headline: string; summary: string; eventDate: string | null };
  sources: { title: string; url: string; publishedAt: string | null }[];
  /** 当前空间/用户，用于把 token 成本归属到正确的空间（缺省则落 null）。 */
  spaceId?: string | null;
  userId?: string | null;
}): Promise<GenerateBriefResult> {
  try {
    // 以信号本身为主条目，来源作为补充条目，喂给 analyzeBrief。
    const items: GeminiNewsItem[] = [
      {
        title: input.signal.headline,
        url: input.sources[0]?.url ?? "",
        publishedDate: input.signal.eventDate,
        summary: input.signal.summary,
      },
      ...input.sources.map((s) => ({
        title: s.title,
        url: s.url,
        publishedDate: s.publishedAt,
        summary: "",
      })),
    ].filter((it) => it.title);

    const analyzed = await analyzeBrief(
      { brand: input.brand, items },
      (e) => void recordUsage({ ...e, operation: "ingest_analyze", spaceId: input.spaceId, userId: input.userId }),
    );
    if (!analyzed) return { ok: false, reason: "AI 未返回有效结果" };
    const verification = await verifyOnX({
      claim: `${analyzed.headline}。${analyzed.factSummary}`,
      brand: input.brand,
      eventDate: analyzed.eventDate,
    });
    return { ok: true, analyzed, verification };
  } catch (err) {
    // 脱敏：只回简短原因，不泄露 key/堆栈
    return { ok: false, reason: err instanceof Error ? err.message : "生成失败" };
  }
}
