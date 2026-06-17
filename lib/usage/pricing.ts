export type Provider = "claude" | "gemini" | "codex" | "deepseek";

export interface ModelPrice {
  /** USD / 1M input tokens */
  inputPer1M: number;
  /** USD / 1M output tokens */
  outputPer1M: number;
  /** 可选：缓存命中输入单价 (USD / 1M) */
  cachedInputPer1M?: number;
  currency: "USD";
}

// 2026-06 web search 查得的当前真实定价。claude/codex 为未来接入预留，当前无调用方。
export const PRICING: Record<Provider, Record<string, ModelPrice>> = {
  claude: {
    "claude-opus-4-8": { inputPer1M: 5.0, outputPer1M: 25.0, cachedInputPer1M: 0.5, currency: "USD" },
    "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3, currency: "USD" },
  },
  gemini: {
    "gemini-3.5-flash": { inputPer1M: 1.5, outputPer1M: 9.0, cachedInputPer1M: 0.15, currency: "USD" },
  },
  codex: {
    "gpt-5.2-codex": { inputPer1M: 1.75, outputPer1M: 14.0, currency: "USD" },
    "gpt-5.3-codex": { inputPer1M: 1.75, outputPer1M: 14.0, currency: "USD" },
    "codex-mini": { inputPer1M: 0.75, outputPer1M: 3.0, currency: "USD" },
  },
  deepseek: {
    "deepseek-v4-flash": { inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.0028, currency: "USD" },
  },
};

export function getModelPrice(provider: Provider, model: string): ModelPrice | null {
  return PRICING[provider]?.[model] ?? null;
}
