import { describe, it, expect } from "vitest";
import { setProductionDraft, createInitialWorkflowState } from "@/lib/workflow/local-workflow";
import type { ProductionPackage } from "@/lib/domain/production";

const pkg = {
  script: { targetDuration: "12-15 min", wordCount: 100, sections: [{ id: "hook", label: "x", duration: "0:00", body: "b" }] },
  storyboard: [{ n: 1, time: "0:00-0:08", shot: "s", voiceOver: "v", visual: "vi", notes: "" }],
  task: { title: "t", format: "f", channel: "c", owner: "o", deadline: "d", budget: "b", checklist: [] },
} as ProductionPackage;

describe("setProductionDraft", () => {
  it("把生产包写进指定 briefId,不影响其他 brief", () => {
    const base = createInitialWorkflowState();
    const next = setProductionDraft(base, "b-test", pkg);
    expect(next.productionDrafts["b-test"]).toEqual(pkg);
    expect(next).not.toBe(base); // 不可变
  });
});
