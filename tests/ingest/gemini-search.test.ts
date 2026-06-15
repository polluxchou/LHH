import { describe, it, expect } from "vitest";
import { parseGeminiResponse, buildSearchPrompt } from "@/lib/ingest/gemini-search";

describe("buildSearchPrompt", () => {
  it("includes absolute date window and brand", () => {
    const p = buildSearchPrompt("SpaceX", "2026-06-08", "2026-06-15");
    expect(p).toContain("SpaceX");
    expect(p).toContain("2026-06-08");
    expect(p).toContain("2026-06-15");
    expect(p.toLowerCase()).toContain("json");
  });

  it("includes keywords and excluded terms when provided", () => {
    const p = buildSearchPrompt("SpaceX", "2026-06-08", "2026-06-15", ["Starship", "Raptor"], ["招聘"]);
    expect(p).toContain("Starship");
    expect(p).toContain("招聘");
  });
});

describe("parseGeminiResponse", () => {
  it("parses a JSON array embedded in text", () => {
    const text =
      'Here are results:\n```json\n[{"title":"T","url":"https://x.com/a","publishedDate":"2026-06-14","summary":"s"}]\n```';
    const items = parseGeminiResponse(text, []);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://x.com/a");
  });

  it("returns [] on unparseable text", () => {
    expect(parseGeminiResponse("no json here", [])).toEqual([]);
  });

  it("drops items that have no url of their own", () => {
    const text = '[{"title":"T","url":"","publishedDate":"2026-06-14","summary":"s"}]';
    expect(parseGeminiResponse(text, [{ web: { uri: "https://src/1", title: "T" } }])).toEqual([]);
  });
});
