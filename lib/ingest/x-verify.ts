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
    `{"status":"corroborated|disputed|contradicted|unverifiable","confidence":0.0,"summary":"1-2 句中文核查结论","evidence":[{"account":"发帖账号(尽量含 @,如 @SpaceX)","quote":"该帖关键原文片段(保留原文语言)","url":"帖子链接"}]}`,
    `4. evidence 最多列 5 条最关键的支持或反驳帖子,优先官方/认证账号;每条务必带上发帖账号与原文片段。无可引用帖子时给空数组 []。`,
  ]
    .filter(Boolean)
    .join("\n");
}

function nonEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// X 上的保留路径段,这些不是账号名。
const RESERVED_X_PATHS = new Set([
  "i", "home", "search", "explore", "hashtag", "notifications", "messages", "settings", "compose",
]);

/**
 * 从 X/Twitter 帖子 URL 解析账号名(不含 @)。
 * 形如 x.com/<account>/status/... → <account>;保留路径(/i/...)或非 X 域名 → ""。
 * xAI 的 citations 多为纯 URL 字符串(无 handle 字段),用它把账号名显示出来。
 */
export function deriveHandle(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^mobile\./, "");
    if (host !== "x.com" && host !== "twitter.com") return "";
    const seg = u.pathname.split("/").filter(Boolean);
    if (!seg.length) return "";
    const handle = seg[0].replace(/^@/, "");
    if (RESERVED_X_PATHS.has(handle.toLowerCase())) return "";
    return handle;
  } catch {
    return "";
  }
}

function evidenceFrom(citations: Citation[]): VerificationEvidence[] {
  // citation 的 title 当作证据片段(excerpt);handle 缺失时从 url 回填账号名,
  // 让详情页能以「@账号名」可点链接呈现。official 暂统一 false(v1 不逐条标官方,
  // "优先官方" 体现在 Grok 的判定里,见 buildVerifyPrompt)。
  // 过滤放宽:有 url 或 handle 或 excerpt 任一即保留,以便"去不到帖子时展示原文"。
  return (citations ?? [])
    .map((c) => {
      const url = nonEmpty(c.url);
      return { handle: nonEmpty(c.handle) || deriveHandle(url), url, excerpt: nonEmpty(c.title), official: false };
    })
    .filter((e) => e.url || e.handle || e.excerpt);
}

/**
 * Grok 在 JSON 里返回的结构化证据:每条带 account(昵称)+ quote(原文片段)+ url。
 * 这是首选来源——citation URL(尤其 x.com/i/status/<id> 形式)拿不到昵称,Grok 直接给。
 */
function evidenceFromGrok(value: unknown): VerificationEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const url = nonEmpty(o.url);
      const handle = (nonEmpty(o.account).replace(/^@/, "")) || deriveHandle(url);
      return { handle, url, excerpt: nonEmpty(o.quote), official: false };
    })
    .filter((e) => e.url || e.handle || e.excerpt);
}

export function parseVerification(
  raw: string,
  citations: Citation[],
  opts: { checkedAt: string },
): Verification {
  const citationEvidence = evidenceFrom(citations);
  const fallback = (summary: string): Verification => ({
    status: "unverifiable",
    confidence: 0,
    summary,
    evidence: citationEvidence,
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
  // 优先 Grok 结构化证据(有昵称+原文);缺省时回落到 citation URL。
  const grokEvidence = evidenceFromGrok(o.evidence);
  return {
    status: o.status as VerificationStatus,
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0)),
    summary: nonEmpty(o.summary) || "(无结论)",
    evidence: grokEvidence.length ? grokEvidence : citationEvidence,
    checkedAt: opts.checkedAt,
  };
}

// ── verifyOnX ────────────────────────────────────────────────────────────────

// x-search 时间窗:相对事件日期不对称取窗。
// 公告/指数纳入/里程碑通稿等几乎都在「生效日」之前数天到数周就由官方发布,
// 而 analyzed.eventDate 往往落在生效日 → 对称窗会把最权威的原始公告挡在 fromDate 之前
// (如 Rocket Lab 6/12 官宣、6/22 生效)。故回看放宽到 30 天;
// 前看保留 7 天,兼顾事件后数天才被官方/媒体提及的合练/里程碑类信号。
const LOOKBACK_DAYS = 30;
const LOOKAHEAD_DAYS = 7;

export interface VerifyDeps {
  search: (prompt: string, opts: { fromDate?: string; toDate?: string }) => Promise<{ text: string; citations: Citation[] }>;
}

/** eventDate ± days → YYYY-MM-DD; 无 eventDate 返回 undefined。 */
function shiftDate(eventDate: string | null, days: number): string | undefined {
  if (!eventDate) return undefined;
  const d = new Date(`${eventDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Extract Grok's text answer from the xAI Responses API response.
 * Per docs: response.output[] contains content blocks; text blocks have type "output_text"
 * and the text lives at output[].content[].text.
 * Fallback: top-level output_text (not documented but defensive).
 */
function extractText(data: Record<string, unknown>): string {
  // Primary: output[].content[].text (real xAI Responses API shape)
  const output = (data as { output?: unknown[] }).output;
  if (Array.isArray(output)) {
    for (const block of output) {
      const content = (block as { content?: unknown[] }).content;
      if (Array.isArray(content)) {
        for (const item of content) {
          const itemTyped = item as { type?: string; text?: string };
          if (itemTyped.type === "output_text" && typeof itemTyped.text === "string") {
            return itemTyped.text;
          }
        }
      }
    }
  }
  // Fallback: top-level output_text (defensive)
  if (typeof (data as { output_text?: unknown }).output_text === "string") {
    return (data as { output_text: string }).output_text;
  }
  return "";
}

/**
 * Extract citations from the xAI Responses API response.
 *
 * Per xAI docs there are TWO places citations can live, and the Responses API
 * primarily uses the first:
 *   1. output[].content[].annotations[]  — objects {type:"url_citation", url, title, ...}
 *      (the Responses API attaches per-source citations here; the top-level array is
 *       often empty under /v1/responses).
 *   2. response.citations               — top-level array of URL strings (or objects).
 * We read both and merge, deduped by url, so we capture citations regardless of which
 * field the API populates. (Earlier we only read #2 → evidence came back empty.)
 */
export function extractCitations(data: Record<string, unknown>): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  const push = (url: unknown, title?: unknown, handle?: unknown) => {
    const u = typeof url === "string" ? url.trim() : "";
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({
      url: u,
      title: typeof title === "string" && title.trim() ? title : undefined,
      handle: typeof handle === "string" && handle.trim() ? handle : undefined,
    });
  };

  // 1) output[].content[].annotations[] with type "url_citation"
  const output = (data as { output?: unknown }).output;
  if (Array.isArray(output)) {
    for (const block of output) {
      const content = (block as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const item of content) {
        const annotations = (item as { annotations?: unknown }).annotations;
        if (!Array.isArray(annotations)) continue;
        for (const a of annotations) {
          const ann = (a ?? {}) as { type?: unknown; url?: unknown; title?: unknown };
          if (ann.type === "url_citation") push(ann.url, ann.title);
        }
      }
    }
  }

  // 2) top-level citations (URL strings or objects) — fallback / supplement
  const raw = (data as { citations?: unknown }).citations;
  if (Array.isArray(raw)) {
    for (const c of raw) {
      if (typeof c === "string") {
        push(c);
      } else if (c && typeof c === "object") {
        const o = c as Record<string, unknown>;
        // 帖子原文优先取 text/snippet/quote,回落到 title。
        const title = [o.text, o.snippet, o.quote, o.title].find((v) => typeof v === "string" && (v as string).trim());
        push(o.url, title, o.handle);
      }
    }
  }

  return out;
}

// Vercel serverless → api.x.ai 偶发 fetch failed / UND_ERR_CONNECT_TIMEOUT(已知平台 egress 问题)。
// 网络层失败时重试 2 次;HTTP 响应(4xx/5xx)是服务端真实回答,不重试。每次有超时上限,
// 控制总耗时不超 maxDuration。失败时把底层 cause.code 透出(区分超时/DNS/拒绝)。
const XAI_ATTEMPTS = 2;
const XAI_TIMEOUT_MS = 20_000;

function defaultDeps(): VerifyDeps {
  return {
    search: async (prompt, opts) => {
      const body = JSON.stringify({
        model: "grok-4.3",
        // Per xAI docs: input is an array of message objects
        input: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "x_search",
            ...(opts.fromDate ? { from_date: opts.fromDate } : {}),
            ...(opts.toDate ? { to_date: opts.toDate } : {}),
          },
        ],
      });
      let lastErr: unknown;
      for (let attempt = 0; attempt < XAI_ATTEMPTS; attempt++) {
        try {
          const res = await fetch("https://api.x.ai/v1/responses", {
            method: "POST",
            headers: {
              authorization: `Bearer ${process.env.XAI_API_KEY ?? ""}`,
              "content-type": "application/json",
            },
            body,
            signal: AbortSignal.timeout(XAI_TIMEOUT_MS),
          });
          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            // 拿到 HTTP 响应即服务端真实回答(鉴权/请求问题),重试无意义 → 直接抛出。
            throw new Error(`x-search HTTP ${res.status}${errBody ? `: ${errBody.slice(0, 300)}` : ""}`);
          }
          const data = (await res.json()) as Record<string, unknown>;
          return { text: extractText(data), citations: extractCitations(data) };
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("x-search HTTP")) throw e;
          lastErr = e; // 网络层失败 → 退避后重试
          if (attempt < XAI_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        }
      }
      // 重试用尽:透出底层网络错误码(UND_ERR_CONNECT_TIMEOUT / ENOTFOUND / ECONNREFUSED…)。
      const cause = (lastErr as { cause?: { code?: string; message?: string } } | undefined)?.cause;
      const detail = cause?.code || cause?.message || (lastErr instanceof Error ? lastErr.message : String(lastErr));
      throw new Error(`x-search 网络连接失败(${detail})`);
    },
  };
}

export async function verifyOnX(
  opts: { claim: string; brand: string; eventDate: string | null },
  deps: VerifyDeps = defaultDeps(),
  now: () => string = () => new Date().toISOString(),
): Promise<Verification> {
  // never-throws 契约:连注入的 now() 抛错也兜住。
  let checkedAt: string;
  try {
    checkedAt = now();
  } catch {
    checkedAt = new Date().toISOString();
  }
  try {
    const prompt = buildVerifyPrompt(opts.claim, { brand: opts.brand, eventDate: opts.eventDate });
    const result = await deps.search(prompt, {
      fromDate: shiftDate(opts.eventDate, -LOOKBACK_DAYS),
      toDate: shiftDate(opts.eventDate, LOOKAHEAD_DAYS),
    });
    return parseVerification(result.text, result.citations, { checkedAt });
  } catch (err) {
    // 透出真实原因(HTTP 状态/网络错误)而非泛化文案,便于从简报本身 + 服务端日志定位。
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[x-verify] verifyOnX failed:", detail);
    return { status: "unverifiable", confidence: 0, summary: `X 核查调用失败：${detail}`, evidence: [], checkedAt };
  }
}
