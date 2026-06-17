import { describe, it, expect } from "vitest";
import { buildArticleStub, buildTranslateStub } from "@/lib/article/stub-article";
import type { EditorialBrief } from "@/lib/domain/types";

const brief = {
  id: "b1",
  briefTitle: "飞沃科技收购西安创航",
  factSummary: "事实摘要正文",
  whyItMatters: "为什么重要正文",
  factBullets: ["要点一", "要点二"],
} as unknown as EditorialBrief;

describe("buildArticleStub", () => {
  it("returns non-empty sections with stable ids", () => {
    const secs = buildArticleStub({ brief, topicCard: null, type: "article", platform: "linkedin", audience: "行业采购" });
    expect(secs.length).toBeGreaterThan(0);
    expect(secs.every((s) => s.id && s.label && s.body)).toBe(true);
  });

  it("short type is no longer than article", () => {
    const a = buildArticleStub({ brief, topicCard: null, type: "article", platform: "website", audience: "" });
    const s = buildArticleStub({ brief, topicCard: null, type: "short", platform: "sms", audience: "" });
    expect(s.length).toBeLessThanOrEqual(a.length);
  });
});

describe("buildTranslateStub", () => {
  it("keeps same ids and prefixes the lang marker", () => {
    const src = [{ id: "lead", label: "导语", body: "正文" }];
    const out = buildTranslateStub(src, "en");
    expect(out.map((s) => s.id)).toEqual(["lead"]);
    expect(out[0].body).toContain("[en]");
  });
});
