import { getModelPrice, type Provider } from "@/lib/usage/pricing";
import type { TokenUsage } from "@/lib/usage/extract";

export interface CostResult {
  inputPricePer1M: number;
  outputPricePer1M: number;
  costUsd: number;
  currency: "USD";
}

export function computeCost(provider: Provider, model: string, usage: TokenUsage): CostResult | null {
  const price = getModelPrice(provider, model);
  if (!price) {
    console.warn(`computeCost: no price for ${provider}/${model}; keeping token counts, cost=null`);
    return null;
  }
  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = Math.max(0, usage.promptTokens - cached);
  const cachedRate = price.cachedInputPer1M ?? price.inputPer1M;
  const costUsd =
    (uncachedInput / 1e6) * price.inputPer1M +
    (cached / 1e6) * cachedRate +
    (usage.completionTokens / 1e6) * price.outputPer1M;
  return {
    inputPricePer1M: price.inputPer1M,
    outputPricePer1M: price.outputPer1M,
    costUsd,
    currency: "USD",
  };
}
