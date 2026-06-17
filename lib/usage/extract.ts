import type { Provider } from "@/lib/usage/pricing";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 可选：输入中命中缓存的部分（promptTokens 的子集） */
  cachedInputTokens?: number;
}

export interface UsageEvent {
  provider: Provider;
  model: string;
  usage: TokenUsage | null;
}

export type UsageSink = (event: UsageEvent) => void;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** OpenAI / DeepSeek（chat.completions）响应的 usage 归一化。 */
export function extractOpenAIUsage(res: unknown): TokenUsage | null {
  const u = (res as { usage?: Record<string, unknown> })?.usage;
  if (!u) return null;
  const cached = (u.prompt_tokens_details as { cached_tokens?: unknown } | undefined)?.cached_tokens;
  const out: TokenUsage = {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens),
  };
  if (typeof cached === "number") out.cachedInputTokens = cached;
  return out;
}

/** @google/genai generateContent 响应的 usageMetadata 归一化。 */
export function extractGeminiUsage(res: unknown): TokenUsage | null {
  const u = (res as { usageMetadata?: Record<string, unknown> })?.usageMetadata;
  if (!u) return null;
  const cached = u.cachedContentTokenCount;
  const out: TokenUsage = {
    promptTokens: num(u.promptTokenCount),
    completionTokens: num(u.candidatesTokenCount),
    totalTokens: num(u.totalTokenCount),
  };
  if (typeof cached === "number") out.cachedInputTokens = cached;
  return out;
}
