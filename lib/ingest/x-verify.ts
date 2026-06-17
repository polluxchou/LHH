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
  // citation 的 title 当作证据片段(excerpt);official 暂统一 false(v1 不逐条标官方,
  // "优先官方" 体现在 Grok 的判定里,见 buildVerifyPrompt)。
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

// ── verifyOnX ────────────────────────────────────────────────────────────────

// 事件日期前后各取 N 天作为 x-search 时间窗。放宽到 ±7 以减少"误判式 unverifiable":
// 合练/里程碑类信号常在事件后数天才被官方/媒体在 X 上提及。
const WINDOW_DAYS = 7;

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
 * Per docs: response.citations is a top-level array of URL strings or citation objects.
 * Each citation may be a plain URL string or an object with at least a `url` field.
 */
function extractCitations(data: Record<string, unknown>): Citation[] {
  const raw = (data as { citations?: unknown }).citations;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => (typeof c === "string" ? { url: c } : (c as Citation)))
    .filter((c) => c && typeof c.url === "string");
}

function defaultDeps(): VerifyDeps {
  return {
    search: async (prompt, opts) => {
      const res = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.XAI_API_KEY ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) throw new Error(`x-search HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      return { text: extractText(data), citations: extractCitations(data) };
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
      fromDate: shiftDate(opts.eventDate, -WINDOW_DAYS),
      toDate: shiftDate(opts.eventDate, WINDOW_DAYS),
    });
    return parseVerification(result.text, result.citations, { checkedAt });
  } catch {
    return { status: "unverifiable", confidence: 0, summary: "X 核查调用失败", evidence: [], checkedAt };
  }
}
