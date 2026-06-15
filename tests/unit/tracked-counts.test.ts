import { describe, expect, it } from "vitest";
import { createInitialWorkflowState } from "@/lib/workflow/local-workflow";
import { getTrackedAbbreviation, getTrackedCountRatio, getTrackedRailLabel } from "@/lib/workflow/tracked-counts";

describe("tracked count ratio", () => {
  it("formats current member subscriptions over all tracked objects", () => {
    const state = createInitialWorkflowState();
    const currentMember = state.teamMembers.find((member) => member.id === state.currentMemberId);

    expect(currentMember).toBeDefined();
    expect(getTrackedCountRatio(state.trackingObjects, currentMember!)).toBe("6/10");
  });

  it("formats the collapsed tracking rail label", () => {
    const state = createInitialWorkflowState();
    const currentMember = state.teamMembers.find((member) => member.id === state.currentMemberId);

    expect(currentMember).toBeDefined();
    expect(getTrackedRailLabel(state.trackingObjects, currentMember!)).toBe("追踪对象 6/10");
  });

  it("builds compact abbreviations for the collapsed tracking rail", () => {
    const state = createInitialWorkflowState();

    expect(getTrackedAbbreviation(state.trackingObjects.find((item) => item.id === "cnsa")!)).toBe("中国");
    expect(getTrackedAbbreviation(state.trackingObjects.find((item) => item.id === "stoke")!)).toBe("SS");
    expect(getTrackedAbbreviation(state.trackingObjects.find((item) => item.id === "starbase")!)).toBe("ST");
  });
});
