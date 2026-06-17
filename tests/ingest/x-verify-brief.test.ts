import { describe, it, expect } from "vitest";
import { buildZhBriefFields } from "@/lib/workflow/local-workflow";
import type { EditorialBrief, CandidateSignal, Verification } from "@/lib/domain/types";

const generated = { riskNotes: ["原有风险"], factSummary: "fs" } as unknown as EditorialBrief;
const signal = { signalType: "technical_project_milestone", confidence: 0.8, summary: "s", eventDate: "2026-06-13", sourceIds: [] } as unknown as CandidateSignal;
const v: Verification = { status: "corroborated", confidence: 0.9, summary: "官方已确认", evidence: [], checkedAt: "AT" };

describe("buildZhBriefFields with verification", () => {
  it("挂上 verification + corroborated 追加佐证 riskNote", () => {
    const brief = buildZhBriefFields(generated, signal, [], "SpaceX", undefined, v);
    expect(brief.verification?.status).toBe("corroborated");
    expect(brief.riskNotes.some((r) => r.includes("X 核查") && r.includes("佐证"))).toBe(true);
    expect(brief.riskNotes).toContain("原有风险"); // 原有的保留
  });
  it("contradicted 追加矛盾 riskNote", () => {
    const brief = buildZhBriefFields(generated, signal, [], "SpaceX", undefined, { ...v, status: "contradicted" });
    expect(brief.riskNotes.some((r) => r.includes("矛盾"))).toBe(true);
  });
  it("无 verification → verification undefined、不加核查 riskNote", () => {
    const brief = buildZhBriefFields(generated, signal, [], "SpaceX", undefined, undefined);
    expect(brief.verification).toBeUndefined();
    expect(brief.riskNotes.some((r) => r.includes("X 核查"))).toBe(false);
  });
});
