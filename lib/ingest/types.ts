import type {
  CandidateSignalType,
  ContentValueScore,
} from "@/lib/domain/types";

/** Gemini 搜索返回的单条新闻（解析后） */
export interface GeminiNewsItem {
  title: string;
  url: string;
  /** ISO date string (YYYY-MM-DD) or null if unknown */
  publishedDate: string | null;
  summary: string;
}

/** DeepSeek 结构化分析的产出 */
export interface AnalyzedBrief {
  signalType: CandidateSignalType;
  headline: string;
  summary: string;
  /** ISO date (YYYY-MM-DD) or null */
  eventDate: string | null;
  confidence: number; // 0..1
  briefTitle: string;
  factSummary: string;
  whyItMatters: string;
  possibleAngles: string[];
  openQuestions: string[];
  riskNotes: string[];
  score: Omit<ContentValueScore, "editorialBriefId" | "compositeScore">;
}

/** 写库前的一次品牌产出 */
export interface IngestResult {
  trackingObjectId: string;
  querySet: string[];
  freshItems: GeminiNewsItem[];
  analyzed: AnalyzedBrief | null; // 无新鲜条目时为 null
}
