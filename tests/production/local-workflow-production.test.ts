import { describe, it, expect } from "vitest";
import {
  setProductionDraft,
  createInitialWorkflowState,
  ensureProductionDraft,
  updateScriptSection,
  updateStoryboardShot,
} from "@/lib/workflow/local-workflow";
import { deriveVoiceOvers } from "@/lib/production/derive-voiceovers";
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

describe("storyboard voice-over stays derived from script", () => {
  const briefId = "b-cna-01";

  it("editing a script section recomputes storyboard voiceOver", () => {
    let st = ensureProductionDraft(createInitialWorkflowState(), briefId);
    const firstSectionId = st.productionDrafts[briefId].script.sections[0].id;
    st = updateScriptSection(st, briefId, firstSectionId, "全新的一句话。第二句。");
    const draft = st.productionDrafts[briefId];
    const expected = deriveVoiceOvers(draft.script, draft.storyboard, "（无）");
    expect(draft.storyboard.map((s) => s.voiceOver)).toEqual(expected);
  });

  it("toggling silent recomputes, and voiceOver patch is ignored", () => {
    let st = ensureProductionDraft(createInitialWorkflowState(), briefId);
    const n = st.productionDrafts[briefId].storyboard[0].n;
    st = updateStoryboardShot(st, briefId, n, { silent: true, voiceOver: "HACK" });
    const draft = st.productionDrafts[briefId];
    expect(draft.storyboard.find((s) => s.n === n)!.silent).toBe(true);
    const expected = deriveVoiceOvers(draft.script, draft.storyboard, "（无）");
    expect(draft.storyboard.map((s) => s.voiceOver)).toEqual(expected);
    expect(draft.storyboard.find((s) => s.n === n)!.voiceOver).not.toBe("HACK");
  });
});
