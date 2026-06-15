import { GoogleGenAI } from "@google/genai";
import type { GeminiNewsItem } from "@/lib/ingest/types";

export interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export function buildSearchPrompt(
  brand: string,
  sinceDate: string,
  todayDate: string,
): string {
  return [
    `今天是 ${todayDate}。请用 Google 搜索，找出关于「${brand}」的航天相关新闻，要求所报道的【事件本身发生】在 ${sinceDate} 至 ${todayDate}（最近一周）之内。`,
    `排除：事件发生在该窗口之外的旧闻、周年回顾、背景科普、综述类文章——即使它们是最近才发布的。`,
    `严格只输出一个 JSON 数组（可包在 \`\`\`json 代码块里），每个元素形如：`,
    `{"title": string, "url": string, "publishedDate": "YYYY-MM-DD", "summary": string}`,
    `publishedDate 必须是该报道的真实发布日期；不确定就省略该条。不要输出 JSON 以外的解释。`,
  ].join("\n");
}

/** 从可能夹带文字/代码块的文本里提取 JSON 数组并归一化 */
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
  void groundingChunks;
  return raw
    .map((r): GeminiNewsItem => {
      const o = (r ?? {}) as Record<string, unknown>;
      const url = (typeof o.url === "string" && o.url) || "";
      return {
        title: typeof o.title === "string" ? o.title : "",
        url,
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
  opts: { brand: string; sinceDate: string; todayDate: string },
  deps: SearchDeps = defaultDeps(),
): Promise<GeminiNewsItem[]> {
  const prompt = buildSearchPrompt(opts.brand, opts.sinceDate, opts.todayDate);
  const { text, groundingChunks } = await deps.generate(prompt);
  return parseGeminiResponse(text, groundingChunks);
}
