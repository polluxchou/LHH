import { describe, it, expect } from "vitest";
import { buildVerifyPrompt, parseVerification, type Citation, verifyOnX, type VerifyDeps } from "@/lib/ingest/x-verify";

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

  it("传入事件日期 → search 收到 ±3 天窗口", async () => {
    let got: { fromDate?: string; toDate?: string } = {};
    await verifyOnX(
      { claim: "x", brand: "y", eventDate: "2026-06-13" },
      { search: async (_p, opts) => { got = opts; return { text: "{}", citations: [] }; } },
      () => "AT",
    );
    expect(got.fromDate).toBe("2026-06-10");
    expect(got.toDate).toBe("2026-06-16");
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
