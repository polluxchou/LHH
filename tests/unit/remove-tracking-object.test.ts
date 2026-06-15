import { describe, expect, it } from "vitest";
import {
  addTrackingObject,
  createInitialWorkflowState,
  removeTrackingObject,
} from "@/lib/workflow/local-workflow";

describe("removeTrackingObject", () => {
  it("removes the object and every record hanging off it (mirrors the DB cascade)", () => {
    const state = createInitialWorkflowState();
    const targetId = state.editorialBriefs[0]!.trackingObjectId; // an object that has briefs/signals
    expect(state.trackingObjects.some((o) => o.id === targetId)).toBe(true);

    const next = removeTrackingObject(state, targetId);

    expect(next.trackingObjects.some((o) => o.id === targetId)).toBe(false);
    expect(next.editorialBriefs.some((b) => b.trackingObjectId === targetId)).toBe(false);
    expect(next.candidateSignals.some((s) => s.trackingObjectId === targetId)).toBe(false);
    expect(next.searchRuns.some((r) => r.trackingObjectId === targetId)).toBe(false);
    expect(next.teamMembers.every((m) => !m.trackingObjectIds.includes(targetId))).toBe(true);
  });

  it("reselects another object when the removed one was selected", () => {
    const state = createInitialWorkflowState();
    const targetId = state.selectedTrackingObjectId;

    const next = removeTrackingObject(state, targetId);

    expect(next.selectedTrackingObjectId).not.toBe(targetId);
    expect(next.trackingObjects.some((o) => o.id === next.selectedTrackingObjectId)).toBe(true);
  });

  it("is a no-op for an unknown id", () => {
    const state = createInitialWorkflowState();
    expect(removeTrackingObject(state, "does-not-exist")).toBe(state);
  });

  it("only clears the targeted object's subscriptions, leaving others intact", () => {
    const base = createInitialWorkflowState();
    const added = addTrackingObject(base, { nameZh: "测试对象", type: "company", priority: 2, subscribe: true });
    const newId = added.selectedTrackingObjectId;
    const otherCountsBefore = added.teamMembers.map((m) => m.trackingObjectIds.filter((id) => id !== newId).length);

    const next = removeTrackingObject(added, newId);

    expect(next.trackingObjects.some((o) => o.id === newId)).toBe(false);
    next.teamMembers.forEach((m, i) => {
      expect(m.trackingObjectIds.includes(newId)).toBe(false);
      expect(m.trackingObjectIds.length).toBe(otherCountsBefore[i]);
    });
  });
});
