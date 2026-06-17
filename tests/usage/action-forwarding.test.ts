import { describe, it, expect, vi, beforeEach } from "vitest";
import type { UsageEvent } from "@/lib/usage/extract";

// Capture every recordUsage(...) call so we can assert the action layer forwards
// spaceId / userId down into the usage row (otherwise per-space cost reports are blank).
const recorded: Array<Record<string, unknown>> = [];
vi.mock("@/lib/usage/record", () => ({
  recordUsage: (input: Record<string, unknown>) => {
    recorded.push(input);
  },
}));

// Stub the AI libs so each generation immediately fires its UsageSink with a fake
// event and returns a trivial result — no network, no DeepSeek key needed.
const fakeEvent: UsageEvent = {
  provider: "deepseek",
  model: "deepseek-v4-flash",
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
};
vi.mock("@/lib/article/deepseek-article", () => ({
  generateArticle: (_a: unknown, onUsage?: (e: UsageEvent) => void) => {
    onUsage?.(fakeEvent);
    return Promise.resolve([{ id: "s1", title: "t", body: "b" }]);
  },
  regenerateSection: (_a: unknown, _s: unknown, onUsage?: (e: UsageEvent) => void) => {
    onUsage?.(fakeEvent);
    return Promise.resolve("body");
  },
  translateSections: (sections: { id: string }[], _lang: unknown, onUsage?: (e: UsageEvent) => void) => {
    onUsage?.(fakeEvent);
    return Promise.resolve(sections.map((s) => ({ ...s, title: "t", body: "b" })));
  },
}));
vi.mock("@/lib/ingest/deepseek-analyze", () => ({
  analyzeBrief: (_a: unknown, onUsage?: (e: UsageEvent) => void) => {
    onUsage?.(fakeEvent);
    return Promise.resolve({ factSummary: "x" });
  },
}));
vi.mock("@/lib/production/deepseek-script", () => ({
  generateProduction: (_a: unknown, onUsage?: (e: UsageEvent) => void) => {
    onUsage?.(fakeEvent);
    return Promise.resolve({ script: [] });
  },
}));

const SPACE = "space-42";
const USER = "user-7";
const baseArticle = {
  brief: {} as never,
  topicCard: null,
  platform: "wechat" as never,
  audienceRole: "general" as never,
  audienceRegion: "cn" as never,
  spaceId: SPACE,
  userId: USER,
};

beforeEach(() => {
  recorded.length = 0;
});

describe("interactive actions forward spaceId/userId into recordUsage", () => {
  it("generateBriefAction forwards space + user", async () => {
    const { generateBriefAction } = await import("@/app/actions/generate-brief");
    await generateBriefAction({
      brand: "ACME",
      signal: { headline: "h", summary: "s", eventDate: null },
      sources: [],
      spaceId: SPACE,
      userId: USER,
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ operation: "ingest_analyze", spaceId: SPACE, userId: USER });
  });

  it("generateProductionAction forwards space + user", async () => {
    const { generateProductionAction } = await import("@/app/actions/generate-production");
    await generateProductionAction({ brief: {} as never, topicCard: null, spaceId: SPACE, userId: USER });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ operation: "production", spaceId: SPACE, userId: USER });
  });

  it("generateArticleAction forwards space + user", async () => {
    const { generateArticleAction } = await import("@/app/actions/generate-article");
    await generateArticleAction(baseArticle);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ operation: "article", spaceId: SPACE, userId: USER });
  });

  it("regenerateArticleSectionAction forwards space + user", async () => {
    const { regenerateArticleSectionAction } = await import("@/app/actions/generate-article");
    await regenerateArticleSectionAction({ ...baseArticle, section: { id: "s1", title: "t", body: "b" } as never });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ operation: "article", spaceId: SPACE, userId: USER });
  });

  it("translateArticleAction forwards space + user", async () => {
    const { translateArticleAction } = await import("@/app/actions/generate-article");
    await translateArticleAction({
      sections: [{ id: "s1", title: "t", body: "b" } as never],
      lang: "en" as never,
      spaceId: SPACE,
      userId: USER,
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ operation: "article", spaceId: SPACE, userId: USER });
  });

  it("retranslateSectionAction forwards space + user", async () => {
    const { retranslateSectionAction } = await import("@/app/actions/generate-article");
    await retranslateSectionAction({
      section: { id: "s1", title: "t", body: "b" } as never,
      lang: "en" as never,
      spaceId: SPACE,
      userId: USER,
    });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ operation: "article", spaceId: SPACE, userId: USER });
  });
});
