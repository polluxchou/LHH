import { describe, expect, it } from "vitest";
import { applyScreeningTransition } from "@/lib/domain/screening-transition";
import type { EditorialBrief } from "@/lib/domain/types";

const editorialBrief: EditorialBrief = {
  id: "brief-stoke-hot-fire",
  candidateSignalId: "signal-stoke-hot-fire",
  trackingObjectId: "tracking-stoke-space",
  briefTitle: "Stoke Space engine test points to reusable launch progress",
  factSummary: "A source reports that Stoke Space completed a full-duration engine hot-fire test.",
  sourceSummary: "One trade-media seed source supports the milestone claim.",
  mapContext: "The signal is associated with the Stoke Space test-site anchor.",
  whyItMatters:
    "Engine test milestones can indicate whether a reusable launcher program is moving from concept toward flight readiness.",
  possibleAngles: ["Technical explainer on reusable launch test milestones", "Company tracking update on Stoke Space"],
  openQuestions: ["Was the test independently confirmed by the company or regulator?"],
  riskNotes: ["Single-source seed item; requires editor verification before publication."],
  locationAnchorIds: ["location-stoke-test-site"],
  status: "ready_for_screening",
  createdAt: "2026-06-07T00:00:00.000Z",
};

describe("screening transition", () => {
  it("creates a topic card only when a brief is approved", () => {
    const result = applyScreeningTransition({
      editorialBrief,
      decision: "approved",
      reason: "",
      sourceIds: ["source-stoke-hot-fire"],
      decidedBy: "unit-test-editor",
    });

    expect(result.screeningDecision).toMatchObject({
      editorialBriefId: "brief-stoke-hot-fire",
      decision: "approved",
      reason: "",
      decidedBy: "unit-test-editor",
      decidedAt: "2026-06-07T00:00:00.000Z",
    });
    expect(result.topicCard).toEqual({
      id: "topic-brief-stoke-hot-fire",
      sourceEditorialBriefId: "brief-stoke-hot-fire",
      workingTitle: "Stoke Space engine test points to reusable launch progress",
      coreQuestion: "Was the test independently confirmed by the company or regulator?",
      recommendedFormat: "technical_explainer",
      keyFacts: [
        "A source reports that Stoke Space completed a full-duration engine hot-fire test.",
        "One trade-media seed source supports the milestone claim.",
      ],
      sourceIds: ["source-stoke-hot-fire"],
      mapContext: "The signal is associated with the Stoke Space test-site anchor.",
      status: "new",
      ownerId: "unit-test-editor",
    });
  });

  it("does not create topic cards for watch or rejected decisions with reasons", () => {
    expect(
      applyScreeningTransition({
        editorialBrief,
        decision: "watch",
        reason: "Needs official confirmation.",
        sourceIds: ["source-stoke-hot-fire"],
        decidedBy: "unit-test-editor",
      }).topicCard,
    ).toBeNull();

    expect(
      applyScreeningTransition({
        editorialBrief,
        decision: "rejected",
        reason: "Too thin for coverage.",
        sourceIds: ["source-stoke-hot-fire"],
        decidedBy: "unit-test-editor",
      }).topicCard,
    ).toBeNull();
  });

  it("requires a non-empty reason for watch and rejected decisions", () => {
    expect(() =>
      applyScreeningTransition({
        editorialBrief,
        decision: "watch",
        reason: " ",
        sourceIds: ["source-stoke-hot-fire"],
        decidedBy: "unit-test-editor",
      }),
    ).toThrow("A screening reason is required for watch and rejected decisions");

    expect(() =>
      applyScreeningTransition({
        editorialBrief,
        decision: "rejected",
        reason: "",
        sourceIds: ["source-stoke-hot-fire"],
        decidedBy: "unit-test-editor",
      }),
    ).toThrow("A screening reason is required for watch and rejected decisions");
  });

  it("requires at least one source id before approving a brief into a topic card", () => {
    expect(() =>
      applyScreeningTransition({
        editorialBrief,
        decision: "approved",
        reason: "",
        sourceIds: [],
        decidedBy: "unit-test-editor",
      }),
    ).toThrow("At least one source id is required to approve a brief into the topic pool");
  });
});
