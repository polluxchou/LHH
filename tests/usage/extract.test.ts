import { describe, it, expect } from "vitest";
import { extractOpenAIUsage, extractGeminiUsage } from "@/lib/usage/extract";

describe("extractOpenAIUsage", () => {
  it("maps OpenAI/DeepSeek usage shape", () => {
    const res = {
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 300,
        total_tokens: 1500,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    };
    expect(extractOpenAIUsage(res)).toEqual({
      promptTokens: 1200,
      completionTokens: 300,
      totalTokens: 1500,
      cachedInputTokens: 200,
    });
  });

  it("returns null when usage missing", () => {
    expect(extractOpenAIUsage({})).toBeNull();
  });
});

describe("extractGeminiUsage", () => {
  it("maps Gemini usageMetadata shape", () => {
    const res = {
      usageMetadata: {
        promptTokenCount: 800,
        candidatesTokenCount: 150,
        totalTokenCount: 950,
        cachedContentTokenCount: 100,
      },
    };
    expect(extractGeminiUsage(res)).toEqual({
      promptTokens: 800,
      completionTokens: 150,
      totalTokens: 950,
      cachedInputTokens: 100,
    });
  });

  it("returns null when usageMetadata missing", () => {
    expect(extractGeminiUsage({})).toBeNull();
  });
});
