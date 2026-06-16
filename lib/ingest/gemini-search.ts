import { GoogleGenAI } from "@google/genai";
import type { GeminiNewsItem } from "@/lib/ingest/types";
import { isLikelyHomepageUrl } from "@/lib/search/url";

export interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export function buildSearchPrompt(
  brand: string,
  sinceDate: string,
  todayDate: string,
  keywords: string[] = [],
  excludedTerms: string[] = [],
): string {
  const lines = [
    `今天是 ${todayDate}。请用 Google 搜索，找出关于「${brand}」的航天相关新闻，要求所报道的【事件本身发生】在 ${sinceDate} 至 ${todayDate}（最近一周）之内。`,
    `排除：事件发生在该窗口之外的旧闻、周年回顾、背景科普、综述类文章——即使它们是最近才发布的。`,
    `严格只输出一个 JSON 数组（可包在 \`\`\`json 代码块里），每个元素形如：`,
    `{"title": string, "url": string, "publishedDate": "YYYY-MM-DD", "summary": string}`,
    `url 必须是该报道【具体文章页】的完整链接（permalink），精确到这篇文章；绝对不要给网站首页、栏目/频道页、标签页或搜索结果页。如果你拿不到具体文章链接，就省略该条，不要用首页凑数。`,
    `publishedDate 必须是该报道的真实发布日期；不确定就省略该条。不要输出 JSON 以外的解释。`,
  ];
  if (keywords.length) lines.push(`重点关注以下方面：${keywords.join("、")}。`);
  if (excludedTerms.length) lines.push(`排除涉及以下内容的报道：${excludedTerms.join("、")}。`);
  return lines.join("\n");
}

/** 归一化标题用于与 grounding 来源做模糊匹配（去空白/标点、小写）。 */
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[\p{P}\p{S}]/gu, "");
}

// 首页/栏目根判定（纯函数）已抽到 lib/search/url.ts，供采集层与 UI 层共用；此处重导出以兼容既有引用。
export { isLikelyHomepageUrl };

/** 按标题把一条新闻匹配到它的 grounding 来源（Google 实际引用页），命中返回其真实 uri。 */
function matchGroundingUri(title: string, chunks: readonly GroundingChunk[]): string | null {
  const t = normalizeTitle(title);
  if (!t) return null;
  let containment: string | null = null;
  for (const c of chunks) {
    const uri = c.web?.uri;
    const ct = c.web?.title ? normalizeTitle(c.web.title) : "";
    if (!uri || !ct) continue;
    if (ct === t) return uri; // 精确匹配优先
    if (!containment && Math.min(ct.length, t.length) >= 4 && (ct.includes(t) || t.includes(ct))) {
      containment = uri; // 退一步：一方包含另一方且长度足够
    }
  }
  return containment;
}

function firstGroundingUri(chunks: readonly GroundingChunk[]): string | null {
  for (const c of chunks) if (c.web?.uri) return c.web.uri;
  return null;
}

/**
 * 为一条新闻挑选最终来源链接：
 *   A) 优先用按标题匹配到的 grounding 真实来源 uri（Google 实际引用页）；
 *   B) 否则用模型给的 url —— 但仅当它是具体文章页（过滤掉纯域名/首页）；
 *   兜底) 模型 url 是首页/为空时，若整轮只有一个 grounding 来源，几乎必是这篇文章，用它；
 *   最后) 实在只有首页就保留（链接不完美也别丢掉这条信号）；都没有则返回空（上游会丢弃）。
 */
export function chooseSourceUrl(
  item: { title: string; url: string },
  chunks: readonly GroundingChunk[],
): string {
  const matched = matchGroundingUri(item.title, chunks);
  if (matched) return matched;

  if (item.url && !isLikelyHomepageUrl(item.url)) return item.url;

  if (chunks.length === 1) {
    const only = firstGroundingUri(chunks);
    if (only) return only;
  }

  return item.url;
}

/** 从可能夹带文字/代码块的文本里提取 JSON 数组并归一化（来源链接走 chooseSourceUrl）。 */
export function parseGeminiResponse(
  text: string,
  groundingChunks: readonly GroundingChunk[],
): GeminiNewsItem[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): GeminiNewsItem => {
      const o = (r ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : "";
      const modelUrl = (typeof o.url === "string" && o.url) || "";
      return {
        title,
        url: chooseSourceUrl({ title, url: modelUrl }, groundingChunks),
        publishedDate:
          typeof o.publishedDate === "string" && o.publishedDate ? o.publishedDate : null,
        summary: typeof o.summary === "string" ? o.summary : "",
      };
    })
    .filter((it) => it.url);
}

export interface SearchDeps {
  generate: (
    prompt: string,
  ) => Promise<{ text: string; groundingChunks: GroundingChunk[] }>;
}

function defaultDeps(): SearchDeps {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return {
    generate: async (prompt) => {
      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const chunks =
        res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      return { text: res.text ?? "", groundingChunks: chunks as GroundingChunk[] };
    },
  };
}

export async function searchRecentNews(
  opts: { brand: string; sinceDate: string; todayDate: string; keywords?: string[]; excludedTerms?: string[] },
  deps: SearchDeps = defaultDeps(),
): Promise<GeminiNewsItem[]> {
  const prompt = buildSearchPrompt(opts.brand, opts.sinceDate, opts.todayDate, opts.keywords ?? [], opts.excludedTerms ?? []);
  const { text, groundingChunks } = await deps.generate(prompt);
  return parseGeminiResponse(text, groundingChunks);
}
