import { describe, expect, it } from "vitest";
import {
  addTrackingObject,
  claimTopicCard,
  createInitialWorkflowState,
  ensureProductionDraft,
  generateBriefForSignal,
  resetProductionDraft,
  runMockSearchForTrackingObject,
  screenBrief,
  switchTeamMember,
  toggleProductionChecklistItem,
  toggleSubscription,
  updateScriptSection,
  updateStoryboardShot,
} from "@/lib/workflow/local-workflow";

describe("local workflow integration", () => {
  it("creates initial workflow state from the demo fixtures", () => {
    const state = createInitialWorkflowState();

    expect(state.trackingObjects.length).toBeGreaterThanOrEqual(10);
    expect(state.candidateSignals.length).toBeGreaterThanOrEqual(20);
    expect(state.editorialBriefs.length).toBeGreaterThanOrEqual(10);
    expect(state.topicCards.length).toBeGreaterThanOrEqual(3);
    expect(state.teamMembers.length).toBe(3);
    expect(state.selectedTrackingObjectId).toBe("starbase");
    expect(state.activeBriefId).toBe("b-sbx-01");
    expect(state.runLog.length).toBeGreaterThan(0);
  });

  it("runs a mocked daily search for a selected tracking object", () => {
    const state = createInitialWorkflowState();
    const nextState = runMockSearchForTrackingObject(state, "stoke");

    expect(nextState.searchRuns.at(-1)).toMatchObject({
      trackingObjectId: "stoke",
      status: "completed",
      newSignalCount: 4,
    });
    expect(nextState.lastFeedback?.message).toContain("Daily search completed");
  });

  it("generates one source-backed brief for a candidate signal and avoids duplicates", () => {
    const state = createInitialWorkflowState();
    const firstState = generateBriefForSignal(state, "s-sbx-05");
    const secondState = generateBriefForSignal(firstState, "s-sbx-05");
    const generatedBriefs = secondState.editorialBriefs.filter((brief) => brief.candidateSignalId === "s-sbx-05");

    expect(generatedBriefs).toHaveLength(1);
    expect(generatedBriefs[0]).toMatchObject({
      trackingObjectId: "starbase",
      status: "ready_for_screening",
      locationAnchorIds: ["loc-starbase", "loc-mcgregor"],
    });
    expect(secondState.lastFeedback?.message).toContain("Brief already exists");
  });

  it("approves an unscreened brief into the topic pool and marks it screened", () => {
    const state = createInitialWorkflowState();
    const nextState = screenBrief(state, {
      briefId: "b-sbx-01",
      decision: "approved",
      reason: "",
      decidedBy: "u-lin",
    });
    const screenedBrief = nextState.editorialBriefs.find((brief) => brief.id === "b-sbx-01");
    const topicCard = nextState.topicCards.find((topic) => topic.sourceEditorialBriefId === "b-sbx-01");

    expect(screenedBrief?.status).toBe("screened");
    expect(topicCard?.workingTitle).toBe("Starship V3 首次完成上面级轨道再入回收");
    expect(topicCard?.ownerId).toBe("u-lin");
    expect(nextState.lastFeedback?.message).toContain("Brief added to the local topic pool.");
  });

  it("keeps watched and rejected briefs out of the topic pool", () => {
    const watchedState = screenBrief(createInitialWorkflowState(), {
      briefId: "b-rkl-01",
      decision: "watch",
      reason: "Needs primary source text.",
      decidedBy: "u-lin",
    });
    const rejectedState = screenBrief(createInitialWorkflowState(), {
      briefId: "b-rkl-01",
      decision: "rejected",
      reason: "Too thin for coverage.",
      decidedBy: "u-lin",
    });

    expect(watchedState.topicCards.some((topic) => topic.sourceEditorialBriefId === "b-rkl-01")).toBe(false);
    expect(rejectedState.topicCards.some((topic) => topic.sourceEditorialBriefId === "b-rkl-01")).toBe(false);
    expect(watchedState.editorialBriefs.find((brief) => brief.id === "b-rkl-01")?.status).toBe("screened");
    expect(rejectedState.editorialBriefs.find((brief) => brief.id === "b-rkl-01")?.status).toBe("screened");
  });

  it("rejects duplicate screening decisions for already-screened briefs", () => {
    const state = createInitialWorkflowState();

    expect(() =>
      screenBrief(state, {
        briefId: "b-isr-01",
        decision: "approved",
        reason: "",
        decidedBy: "u-lin",
      }),
    ).toThrow("Brief has already been screened");
  });

  it("switches the active team member and toggles subscriptions per member", () => {
    const state = createInitialWorkflowState();
    const switched = switchTeamMember(state, "u-zhou");

    expect(switched.currentMemberId).toBe("u-zhou");
    expect(switched.runLog.at(-1)).toMatchObject({ event: "user_switched" });

    const zhou = switched.teamMembers.find((member) => member.id === "u-zhou");

    expect(zhou?.trackingObjectIds).not.toContain("cnsa");

    const subscribed = toggleSubscription(switched, "u-zhou", "cnsa");

    expect(subscribed.teamMembers.find((member) => member.id === "u-zhou")?.trackingObjectIds).toContain("cnsa");
    // 林哈哈's subscriptions stay untouched
    expect(subscribed.teamMembers.find((member) => member.id === "u-lin")?.trackingObjectIds).toEqual(
      state.teamMembers.find((member) => member.id === "u-lin")?.trackingObjectIds,
    );

    const unsubscribed = toggleSubscription(subscribed, "u-zhou", "cnsa");

    expect(unsubscribed.teamMembers.find((member) => member.id === "u-zhou")?.trackingObjectIds).not.toContain("cnsa");
  });

  it("adds a new tracking object, optionally subscribing the current member", () => {
    const state = createInitialWorkflowState();
    const nextState = addTrackingObject(state, {
      nameZh: "天兵科技",
      name: "Space Pioneer",
      type: "company",
      priority: 2,
      primaryTrack: "液氧煤油 · 中型运载",
      keywords: ["天龙三号"],
      subscribe: true,
    });
    const added = nextState.trackingObjects.at(-1);

    expect(added).toMatchObject({ name: "Space Pioneer", nameZh: "天兵科技", type: "company", priority: 2 });
    expect(nextState.selectedTrackingObjectId).toBe(added?.id);
    expect(
      nextState.teamMembers.find((member) => member.id === nextState.currentMemberId)?.trackingObjectIds,
    ).toContain(added?.id);
    expect(nextState.runLog.at(-1)).toMatchObject({ event: "tracking_object_added" });
  });

  it("keeps editable production drafts per brief, surviving reopen and supporting reset", () => {
    const state = createInitialWorkflowState();

    // curated package is seeded
    expect(state.productionDrafts["b-cna-01"]?.script.sections.length).toBeGreaterThan(0);

    // ensure builds a stub draft for a pool brief without a curated package
    const ensured = ensureProductionDraft(state, "b-rkl-pool");

    expect(ensured.productionDrafts["b-rkl-pool"]?.storyboard.length).toBeGreaterThan(0);
    // idempotent
    expect(ensureProductionDraft(ensured, "b-rkl-pool").productionDrafts["b-rkl-pool"]).toBe(
      ensured.productionDrafts["b-rkl-pool"],
    );

    // script + storyboard edits persist in state (二次编辑)
    const edited = updateStoryboardShot(
      updateScriptSection(ensured, "b-rkl-pool", "hook", "新的开场草稿"),
      "b-rkl-pool",
      1,
      { shot: "改过的标题卡", notes: "音乐换成低频" },
    );

    expect(edited.productionDrafts["b-rkl-pool"]?.script.sections.find((s) => s.id === "hook")?.body).toBe(
      "新的开场草稿",
    );
    expect(edited.productionDrafts["b-rkl-pool"]?.storyboard.find((s) => s.n === 1)).toMatchObject({
      shot: "改过的标题卡",
      notes: "音乐换成低频",
    });

    // checklist toggle
    const toggled = toggleProductionChecklistItem(edited, "b-rkl-pool", "k1");

    expect(toggled.productionDrafts["b-rkl-pool"]?.task.checklist.find((c) => c.id === "k1")?.done).toBe(true);

    // reset restores pristine content
    const reset = resetProductionDraft(toggled, "b-rkl-pool");

    expect(reset.productionDrafts["b-rkl-pool"]?.script.sections.find((s) => s.id === "hook")?.body).not.toBe(
      "新的开场草稿",
    );

    // curated package resets to fixture content
    const curatedEdited = updateScriptSection(state, "b-cna-01", "hook", "覆写");
    const curatedReset = resetProductionDraft(curatedEdited, "b-cna-01");

    expect(curatedReset.productionDrafts["b-cna-01"]?.script.sections[0]?.body).toContain("2026 年春天");
  });

  it("claims an unowned topic card for a member", () => {
    const state = createInitialWorkflowState();
    const nextState = claimTopicCard(state, "topic-b-rkl-pool", "u-he");
    const claimed = nextState.topicCards.find((topic) => topic.id === "topic-b-rkl-pool");

    expect(claimed?.ownerId).toBe("u-he");
    expect(claimed?.status).toBe("assigned");
    expect(nextState.runLog.at(-1)).toMatchObject({ event: "topic_claimed" });
  });
});
