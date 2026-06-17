import OpenAI from "openai";
import type { GeminiNewsItem, AnalyzedBrief } from "@/lib/ingest/types";
import type { CandidateSignalType } from "@/lib/domain/types";
import { extractOpenAIUsage, type TokenUsage, type UsageSink } from "@/lib/usage/extract";

const SIGNAL_TYPES: CandidateSignalType[] = [
  "technical_project_milestone",
  "location_facility_change",
  "policy_regulatory_change",
];

export function buildAnalyzePrompt(brand: string, items: readonly GeminiNewsItem[]): string {
  const list = items
    .map((it, i) => `${i + 1}. [${it.publishedDate ?? "?"}] ${it.title} — ${it.summary} (${it.url})`)
    .join("\n");
  return [
    `你是航天领域的选题编辑。下面是关于「${brand}」最近一周的新闻条目：`,
    list,
    ``,
    `请综合这些条目，输出一个 JSON 对象（只输出 json，不要解释），字段如下，并给出一个示例值：`,
    `{`,
    `  "signalType": "technical_project_milestone" | "location_facility_change" | "policy_regulatory_change",`,
    `  "headline": "一句话信号标题",`,
    `  "summary": "2-3 句事实摘要",`,
    `  "eventDate": "YYYY-MM-DD 或 null",`,
    `  "confidence": 0.0~1.0,`,
    `  "briefTitle": "简报标题",`,
    `  "factSummary": "事实综述",`,
    `  "whyItMatters": "为什么重要",`,
    `  "possibleAngles": ["角度1","角度2"],`,
    `  "openQuestions": ["问题1"],`,
    `  "riskNotes": ["风险1"],`,
    `  "score": {"freshnessScore":1-5,"importanceScore":1-5,"rarityScore":1-5,"audienceInterestScore":1-5,"visualPotentialScore":1-5,"riskScore":1-5,"overallRecommendation":"strong|medium|weak","scoringNotes":"打分理由"}`,
    `}`,
  ].join("\n");
}

function n1to5(v: unknown): number {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.min(5, Math.max(1, x)) : 3;
}

export function parseAnalysis(jsonText: string): AnalyzedBrief | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  if (!SIGNAL_TYPES.includes(o.signalType as CandidateSignalType)) return null;
  const headline = String(o.headline ?? "").trim();
  const summary = String(o.summary ?? "").trim();
  const factSummary = String(o.factSummary ?? o.summary ?? "").trim();
  const whyItMatters = String(o.whyItMatters ?? "").trim();
  if (!headline || !summary || !factSummary || !whyItMatters) return null;
  if (!o.score || typeof o.score !== "object") return null;
  const s = o.score as Record<string, unknown>;
  const rec = s.overallRecommendation;
  return {
    signalType: o.signalType as CandidateSignalType,
    headline,
    summary,
    eventDate: typeof o.eventDate === "string" && o.eventDate ? o.eventDate : null,
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0.5)),
    briefTitle: String(o.briefTitle ?? o.headline ?? ""),
    factSummary,
    whyItMatters,
    possibleAngles: Array.isArray(o.possibleAngles) ? o.possibleAngles.map(String) : [],
    openQuestions: Array.isArray(o.openQuestions) ? o.openQuestions.map(String) : [],
    riskNotes: Array.isArray(o.riskNotes) ? o.riskNotes.map(String) : [],
    score: {
      freshnessScore: n1to5(s.freshnessScore),
      importanceScore: n1to5(s.importanceScore),
      rarityScore: n1to5(s.rarityScore),
      audienceInterestScore: n1to5(s.audienceInterestScore),
      visualPotentialScore: n1to5(s.visualPotentialScore),
      riskScore: n1to5(s.riskScore),
      overallRecommendation:
        rec === "strong" || rec === "medium" || rec === "weak" ? rec : "medium",
      scoringNotes: String(s.scoringNotes ?? ""),
    },
  };
}

export interface AnalyzeDeps {
  complete: (prompt: string) => Promise<{ text: string; usage: TokenUsage | null }>;
}

function defaultDeps(): AnalyzeDeps {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  return {
    complete: async (prompt) => {
      const res = await client.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      return { text: res.choices[0]?.message?.content ?? "", usage: extractOpenAIUsage(res) };
    },
  };
}

export async function analyzeBrief(
  opts: { brand: string; items: GeminiNewsItem[] },
  onUsage?: UsageSink,
  deps: AnalyzeDeps = defaultDeps(),
): Promise<AnalyzedBrief | null> {
  if (opts.items.length === 0) return null;
  const { text, usage } = await deps.complete(buildAnalyzePrompt(opts.brand, opts.items));
  onUsage?.({ provider: "deepseek", model: "deepseek-v4-flash", usage });
  return parseAnalysis(text);
}
