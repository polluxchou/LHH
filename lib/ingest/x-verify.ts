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
