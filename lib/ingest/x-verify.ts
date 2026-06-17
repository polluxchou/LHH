import type { Verification, VerificationStatus, VerificationEvidence } from "@/lib/domain/types";

const STATUSES: VerificationStatus[] = ["corroborated", "disputed", "contradicted", "unverifiable"];

export interface Citation {
  url: string;
  title?: string;
  handle?: string;
}

export function buildVerifyPrompt(claim: string, ctx: { brand: string; eventDate: string | null }): string {
  return [
    `你是事实核查员。请在 X(Twitter)上核查下面这条关于「${ctx.brand}」的说法是否属实。`,
    `【待核说法】${claim}`,
    ctx.eventDate ? `【事件日期】${ctx.eventDate}` : ``,
    ``,
    `要求:`,
    `1. 优先依据官方/认证账号(蓝标、当事机构或人物本人)的帖子判断;普通账号仅作参考。`,
    `2. 结论取以下之一:corroborated(有官方/可信佐证)| disputed(无官方佐证或说法存疑)| contradicted(X 上有可信信息与之矛盾)| unverifiable(X 上无相关覆盖、无法核验)。`,
    `3. 只输出一个 JSON 对象(不要解释、不要 markdown 代码块):`,
    `{"status":"corroborated|disputed|contradicted|unverifiable","confidence":0.0,"summary":"1-2 句中文核查结论"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function nonEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function evidenceFrom(citations: Citation[]): VerificationEvidence[] {
  return (citations ?? [])
    .map((c) => ({ handle: nonEmpty(c.handle), url: nonEmpty(c.url), excerpt: nonEmpty(c.title), official: false }))
    .filter((e) => e.url);
}

export function parseVerification(
  raw: string,
  citations: Citation[],
  opts: { checkedAt: string },
): Verification {
  const evidence = evidenceFrom(citations);
  const fallback = (summary: string): Verification => ({
    status: "unverifiable",
    confidence: 0,
    summary,
    evidence,
    checkedAt: opts.checkedAt,
  });

  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback("X 核查未返回有效 JSON");
  }
  if (!o || typeof o !== "object" || !STATUSES.includes(o.status as VerificationStatus)) {
    return fallback("X 核查状态非法或缺失");
  }
  return {
    status: o.status as VerificationStatus,
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0)),
    summary: nonEmpty(o.summary) || "(无结论)",
    evidence,
    checkedAt: opts.checkedAt,
  };
}
