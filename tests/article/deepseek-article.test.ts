import { describe, it, expect } from "vitest";
import { buildArticlePrompt, buildTranslatePrompt, parseSections, generateArticle } from "@/lib/article/deepseek-article";
import type { EditorialBrief } from "@/lib/domain/types";

const brief = {
  id: "b1",
  briefTitle: "T",
  factSummary: "F",
  whyItMatters: "W",
  factBullets: ["a"],
} as unknown as EditorialBrief;

describe("buildArticlePrompt", () => {
  it("includes type/platform/audience and demands JSON", () => {
    const p = buildArticlePrompt({ brief, topicCard: null, type: "short", platform: "xiaohongshu", audience: "新手妈妈" });
    expect(p).toContain("小红书");
    expect(p).toContain("新手妈妈");
    expect(p.toLowerCase()).toContain("json");
  });
});

describe("parseSections", () => {
  it("parses a sections JSON with code fence", () => {
    const out = parseSections('```json\n{"sections":[{"id":"lead","label":"导语","body":"正文"}]}\n```');
    expect(out).toEqual([{ id: "lead", label: "导语", body: "正文" }]);
  });

  it("returns null on garbage or empty", () => {
    expect(parseSections("nope")).toBeNull();
    expect(parseSections('{"sections":[]}')).toBeNull();
  });
});

describe("buildTranslatePrompt", () => {
  it("names the target language and demands JSON", () => {
    const p = buildTranslatePrompt([{ id: "lead", label: "导语", body: "正文" }], "en");
    expect(p.toLowerCase()).toContain("json");
    expect(p).toContain("en");
  });
});

describe("generateArticle onUsage", () => {
  it("forwards usage with deepseek provider+model", async () => {
    const events: unknown[] = [];
    const out = await generateArticle(
      { brief, topicCard: null, type: "short", platform: "xiaohongshu", audience: "新手妈妈" },
      (e) => events.push(e),
      { complete: async () => ({ text: '{"sections":[{"id":"lead","label":"导语","body":"正文"}]}', usage: { promptTokens: 300, completionTokens: 80, totalTokens: 380 } }) },
    );
    expect(out).toEqual([{ id: "lead", label: "导语", body: "正文" }]);
    expect(events).toEqual([
      { provider: "deepseek", model: "deepseek-v4-flash", usage: { promptTokens: 300, completionTokens: 80, totalTokens: 380 } },
    ]);
  });
});
