import { describe, it, expect } from "vitest";
import {
  parseGeminiResponse,
  buildSearchPrompt,
  isLikelyHomepageUrl,
  chooseSourceUrl,
  searchRecentNews,
} from "@/lib/ingest/gemini-search";

describe("buildSearchPrompt", () => {
  it("includes absolute date window and brand", () => {
    const p = buildSearchPrompt("SpaceX", "2026-06-08", "2026-06-15");
    expect(p).toContain("SpaceX");
    expect(p).toContain("2026-06-08");
    expect(p).toContain("2026-06-15");
    expect(p.toLowerCase()).toContain("json");
  });

  it("demands a specific article permalink, not a homepage", () => {
    const p = buildSearchPrompt("SpaceX", "2026-06-08", "2026-06-15");
    expect(p).toContain("permalink");
    expect(p).toContain("首页");
  });

  it("includes keywords and excluded terms when provided", () => {
    const p = buildSearchPrompt("SpaceX", "2026-06-08", "2026-06-15", ["Starship", "Raptor"], ["招聘"]);
    expect(p).toContain("Starship");
    expect(p).toContain("招聘");
  });
});

describe("isLikelyHomepageUrl", () => {
  it("flags bare domains / homepages / section roots", () => {
    for (const u of [
      "https://luosi.com",
      "https://luosi.com/",
      "https://luosi.com/index.html",
      "https://site.com/news",
      "https://site.com/zh",
      "not-a-url",
    ]) {
      expect(isLikelyHomepageUrl(u)).toBe(true);
    }
  });

  it("accepts real article paths", () => {
    for (const u of [
      "https://luosi.com/news/2026/feiwo-acquires-xichuang.html",
      "https://site.com/a/b",
      "https://site.com/article-12345",
    ]) {
      expect(isLikelyHomepageUrl(u)).toBe(false);
    }
  });
});

describe("chooseSourceUrl", () => {
  const chunk = (uri: string, title: string) => ({ web: { uri, title } });

  it("prefers a grounding source matched by title over a homepage model url", () => {
    const url = chooseSourceUrl(
      { title: "飞沃科技收购西安创航", url: "https://luosi.com" },
      [chunk("https://grounding/redirect/abc", "飞沃科技收购西安创航")],
    );
    expect(url).toBe("https://grounding/redirect/abc");
  });

  it("keeps a real article model url when no grounding match", () => {
    const url = chooseSourceUrl({ title: "T", url: "https://x.com/a/b" }, []);
    expect(url).toBe("https://x.com/a/b");
  });

  it("falls back to the sole grounding source when model url is a homepage", () => {
    const url = chooseSourceUrl({ title: "no match", url: "https://luosi.com" }, [
      chunk("https://grounding/only", "完全不同的标题"),
    ]);
    expect(url).toBe("https://grounding/only");
  });

  it("keeps the homepage as a last resort rather than dropping the signal", () => {
    const url = chooseSourceUrl({ title: "x", url: "https://luosi.com" }, []);
    expect(url).toBe("https://luosi.com");
  });
});

describe("parseGeminiResponse", () => {
  it("parses a JSON array embedded in text and keeps a real article url", () => {
    const text =
      'Here are results:\n```json\n[{"title":"T","url":"https://x.com/a","publishedDate":"2026-06-14","summary":"s"}]\n```';
    const items = parseGeminiResponse(text, []);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://x.com/a");
  });

  it("returns [] on unparseable text", () => {
    expect(parseGeminiResponse("no json here", [])).toEqual([]);
  });

  it("uses the grounding source uri when the model omits its own url", () => {
    const text = '[{"title":"T","url":"","publishedDate":"2026-06-14","summary":"s"}]';
    const items = parseGeminiResponse(text, [{ web: { uri: "https://src/1", title: "T" } }]);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://src/1");
  });

  it("drops an item with no url and no grounding source", () => {
    const text = '[{"title":"T","url":"","publishedDate":"2026-06-14","summary":"s"}]';
    expect(parseGeminiResponse(text, [])).toEqual([]);
  });
});

describe("searchRecentNews onUsage", () => {
  it("forwards normalized usage with gemini provider+model", async () => {
    const events: unknown[] = [];
    const items = await searchRecentNews(
      { brand: "SpaceX", sinceDate: "2026-06-08", todayDate: "2026-06-15" },
      (e) => events.push(e),
      {
        generate: async () => ({
          text: '[{"title":"T","url":"https://x.com/a","publishedDate":"2026-06-14","summary":"s"}]',
          groundingChunks: [],
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        }),
      },
    );
    expect(items).toHaveLength(1);
    expect(events).toEqual([
      { provider: "gemini", model: "gemini-3.5-flash", usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } },
    ]);
  });
});
