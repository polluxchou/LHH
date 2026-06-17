import { describe, it, expect } from "vitest";
import { buildVerifyPrompt, parseVerification, deriveHandle, extractCitations, type Citation, verifyOnX, type VerifyDeps } from "@/lib/ingest/x-verify";

describe("extractCitations", () => {
  it("从 output[].content[].annotations[](url_citation)抽引用", () => {
    const data = {
      output: [{ type: "message", content: [{ type: "output_text", text: "{}", annotations: [
        { type: "url_citation", url: "https://x.com/Nasdaq/status/9", title: "Nasdaq-100 announcement", start_index: 0, end_index: 5 },
      ] }] }],
    };
    const c = extractCitations(data);
    expect(c).toHaveLength(1);
    expect(c[0].url).toBe("https://x.com/Nasdaq/status/9");
    expect(c[0].title).toBe("Nasdaq-100 announcement");
  });
  it("兜底读顶层 citations(URL 字符串)", () => {
    const c = extractCitations({ citations: ["https://x.com/RocketLab/status/1"] });
    expect(c[0].url).toBe("https://x.com/RocketLab/status/1");
  });
  it("两来源合并并按 url 去重", () => {
    const data = {
      output: [{ content: [{ annotations: [{ type: "url_citation", url: "https://x.com/A/status/1" }] }] }],
      citations: ["https://x.com/A/status/1", "https://x.com/B/status/2"],
    };
    const c = extractCitations(data);
    expect(c.map((x) => x.url).sort()).toEqual(["https://x.com/A/status/1", "https://x.com/B/status/2"]);
  });
  it("无引用 → 空数组(不抛)", () => {
    expect(extractCitations({})).toEqual([]);
    expect(extractCitations({ output: "nope", citations: 42 })).toEqual([]);
  });
});

describe("deriveHandle", () => {
  it("从帖子 URL 解析账号名", () => {
    expect(deriveHandle("https://x.com/SpaceX/status/123")).toBe("SpaceX");
    expect(deriveHandle("https://twitter.com/NASA/status/9")).toBe("NASA");
    expect(deriveHandle("https://www.x.com/Rocket_Lab")).toBe("Rocket_Lab");
  });
  it("保留路径(如 /i/web/...)或非 X 域名 → 空", () => {
    expect(deriveHandle("https://x.com/i/web/status/1")).toBe("");
    expect(deriveHandle("https://example.com/foo")).toBe("");
    expect(deriveHandle("")).toBe("");
    expect(deriveHandle("not a url")).toBe("");
  });
});

describe("buildVerifyPrompt", () => {
  const p = buildVerifyPrompt("SpaceX 完成第35次复用", { brand: "SpaceX", eventDate: "2026-06-13" });
  it("含待核说法与品牌", () => {
    expect(p).toContain("SpaceX 完成第35次复用");
    expect(p).toContain("SpaceX");
  });
  it("要求优先官方/认证账号", () => {
    expect(p).toContain("官方");
    expect(p).toContain("认证");
  });
  it("含四种 status 取值与 json 指示", () => {
    expect(p).toContain("corroborated");
    expect(p).toContain("contradicted");
    expect(p).toContain("unverifiable");
    expect(p.toLowerCase()).toContain("json");
  });
  it("有事件日期时带上", () => {
    expect(p).toContain("2026-06-13");
  });
  it("要求返回结构化 evidence(account/quote/url)", () => {
    expect(p).toContain("evidence");
    expect(p).toContain("account");
    expect(p).toContain("quote");
  });
});

const cites: Citation[] = [{ url: "https://x.com/SpaceX/status/1", title: "Falcon 9 booster ... 35th flight", handle: "SpaceX" }];
const AT = "2026-06-15T00:00:00.000Z";

describe("parseVerification", () => {
  it("合法 JSON + citations → 正确 Verification", () => {
    const v = parseVerification(JSON.stringify({ status: "corroborated", confidence: 0.9, summary: "官方已确认" }), cites, { checkedAt: AT });
    expect(v.status).toBe("corroborated");
    expect(v.confidence).toBeCloseTo(0.9);
    expect(v.summary).toBe("官方已确认");
    expect(v.evidence).toHaveLength(1);
    expect(v.evidence[0].url).toBe("https://x.com/SpaceX/status/1");
    expect(v.evidence[0].handle).toBe("SpaceX");
    expect(v.checkedAt).toBe(AT);
  });
  it("坏 JSON → unverifiable(仍保留 evidence)", () => {
    const v = parseVerification("not json", cites, { checkedAt: AT });
    expect(v.status).toBe("unverifiable");
    expect(v.evidence).toHaveLength(1);
  });
  it("非法 status → unverifiable", () => {
    const v = parseVerification(JSON.stringify({ status: "true", confidence: 1, summary: "x" }), [], { checkedAt: AT });
    expect(v.status).toBe("unverifiable");
  });
  it("confidence 夹到 0-1", () => {
    const v = parseVerification(JSON.stringify({ status: "disputed", confidence: 5, summary: "x" }), [], { checkedAt: AT });
    expect(v.confidence).toBe(1);
  });
  it("citation 缺 handle 时从 url 回填账号名", () => {
    const v = parseVerification(JSON.stringify({ status: "corroborated", confidence: 0.5, summary: "x" }), [{ url: "https://x.com/NASA/status/7" }], { checkedAt: AT });
    expect(v.evidence[0].handle).toBe("NASA");
  });
  it("只有原文(无 url) → 保留为证据(不被丢弃)", () => {
    const v = parseVerification(JSON.stringify({ status: "disputed", confidence: 0.3, summary: "x" }), [{ url: "", title: "帖子原文片段" }], { checkedAt: AT });
    expect(v.evidence).toHaveLength(1);
    expect(v.evidence[0].excerpt).toBe("帖子原文片段");
  });
  it("Grok 返回结构化 evidence → 优先用它(account 当昵称、quote 当原文)", () => {
    const raw = JSON.stringify({
      status: "corroborated", confidence: 0.8, summary: "x",
      evidence: [{ account: "@Nasdaq", quote: "RKLB joins the Nasdaq-100", url: "https://x.com/i/status/123" }],
    });
    const v = parseVerification(raw, [{ url: "https://x.com/i/status/999" }], { checkedAt: AT });
    expect(v.evidence).toHaveLength(1);
    expect(v.evidence[0].handle).toBe("Nasdaq");
    expect(v.evidence[0].excerpt).toBe("RKLB joins the Nasdaq-100");
    expect(v.evidence[0].url).toBe("https://x.com/i/status/123");
  });
  it("Grok evidence 缺省/为空 → 回落到 citations", () => {
    const raw = JSON.stringify({ status: "corroborated", confidence: 0.8, summary: "x", evidence: [] });
    const v = parseVerification(raw, [{ url: "https://x.com/SpaceX/status/1" }], { checkedAt: AT });
    expect(v.evidence[0].handle).toBe("SpaceX");
  });
});

describe("verifyOnX", () => {
  const okSearch: VerifyDeps["search"] = async () => ({
    text: JSON.stringify({ status: "corroborated", confidence: 0.8, summary: "官方账号已发帖确认" }),
    citations: [{ url: "https://x.com/SpaceX/status/1", title: "...", handle: "SpaceX" }],
  });

  it("注入 mock → 对应 Verification", async () => {
    const v = await verifyOnX(
      { claim: "SpaceX 第35次复用", brand: "SpaceX", eventDate: "2026-06-13" },
      { search: okSearch },
      () => "2026-06-15T00:00:00.000Z",
    );
    expect(v.status).toBe("corroborated");
    expect(v.evidence[0].handle).toBe("SpaceX");
    expect(v.checkedAt).toBe("2026-06-15T00:00:00.000Z");
  });

  it("search 抛错 → unverifiable(不抛出)", async () => {
    const v = await verifyOnX(
      { claim: "x", brand: "y", eventDate: null },
      { search: async () => { throw new Error("network"); } },
      () => "2026-06-15T00:00:00.000Z",
    );
    expect(v.status).toBe("unverifiable");
    expect(v.checkedAt).toBe("2026-06-15T00:00:00.000Z");
  });

  it("传入事件日期 → search 收到 ±7 天窗口", async () => {
    let got: { fromDate?: string; toDate?: string } = {};
    await verifyOnX(
      { claim: "x", brand: "y", eventDate: "2026-06-13" },
      { search: async (_p, opts) => { got = opts; return { text: "{}", citations: [] }; } },
      () => "AT",
    );
    expect(got.fromDate).toBe("2026-06-06");
    expect(got.toDate).toBe("2026-06-20");
  });

  it("无事件日期 → search 不带日期窗口(both undefined)", async () => {
    let got: { fromDate?: string; toDate?: string } = { fromDate: "x", toDate: "y" };
    await verifyOnX(
      { claim: "x", brand: "y", eventDate: null },
      { search: async (_p, opts) => { got = opts; return { text: "{}", citations: [] }; } },
      () => "AT",
    );
    expect(got.fromDate).toBeUndefined();
    expect(got.toDate).toBeUndefined();
  });
});
