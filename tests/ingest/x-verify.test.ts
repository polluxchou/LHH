import { describe, it, expect } from "vitest";
import { buildVerifyPrompt } from "@/lib/ingest/x-verify";

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
