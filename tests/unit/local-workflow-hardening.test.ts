import { describe, expect, it } from "vitest";
import {
  createInitialWorkflowState,
  generateBriefForSignal,
  getSourcesForBrief,
  runFailedMockSearchForTrackingObject,
  runMockSearchForTrackingObject,
} from "@/lib/workflow/local-workflow";

describe("local workflow hardening", () => {
  it("starts with an initialization run-log entry", () => {
    const state = createInitialWorkflowState();

    expect(state.runLog.at(0)).toMatchObject({
      level: "info",
      event: "fixtures_loaded",
    });
  });

  it("logs successful mocked search runs", () => {
    const state = runMockSearchForTrackingObject(createInitialWorkflowState(), "stoke");

    expect(state.runLog.at(-1)).toMatchObject({
      level: "success",
      event: "search_completed",
      trackingObjectId: "stoke",
    });
    expect(state.runLog.at(-1)?.data).toMatchObject({ signals: 4, dedup: 1 });
  });

  it("supports deterministic failed-search simulation without removing existing signals", () => {
    const initial = createInitialWorkflowState();
    const state = runFailedMockSearchForTrackingObject(initial, "starbase", "Search provider quota exhausted");
    const failedRun = state.searchRuns.at(-1);

    expect(failedRun).toMatchObject({
      trackingObjectId: "starbase",
      status: "failed",
      errorSummary: "Search provider quota exhausted",
    });
    expect(state.candidateSignals).toHaveLength(initial.candidateSignals.length);
    expect(state.lastFeedback).toMatchObject({
      tone: "warning",
      message: "Daily search failed for Starbase.",
    });
    expect(state.runLog.at(-1)).toMatchObject({
      level: "error",
      event: "search_failed",
      detail: "Search provider quota exhausted",
    });
  });

  it("logs duplicate brief generation without changing brief count", () => {
    const initial = createInitialWorkflowState();
    const state = generateBriefForSignal(initial, "s-stk-01");

    expect(state.editorialBriefs).toHaveLength(initial.editorialBriefs.length);
    expect(state.runLog.at(-1)).toMatchObject({
      level: "info",
      event: "duplicate_brief_detected",
      briefId: "b-stk-01",
    });
  });

  it("returns source-confidence records for a brief", () => {
    const state = createInitialWorkflowState();
    const sources = getSourcesForBrief(state, "b-isr-01");

    expect(sources.map((source) => source.id)).toEqual(["src-spacenews", "src-isar-pr"]);
    expect(sources.find((source) => source.id === "src-isar-pr")).toMatchObject({
      confidence: 0.85,
      title: "Isar Aerospace Press",
    });
  });
});
