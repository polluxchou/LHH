import { describe, expect, it } from "vitest";
import { generateEditorialBrief } from "@/lib/briefing/brief-generator";
import type { CandidateSignal, Source } from "@/lib/domain/types";

const signal: CandidateSignal = {
  id: "signal-stoke-hot-fire",
  trackingObjectId: "tracking-stoke-space",
  searchRunId: "search-run-stoke-2026-06-07",
  signalType: "technical_project_milestone",
  headline: "Stoke Space completes full-duration engine hot-fire test",
  summary: "A reported full-duration engine hot-fire suggests progress toward reusable launch vehicle milestones.",
  eventDate: "2026-06-01",
  detectedAt: "2026-06-07T00:00:00.000Z",
  sourceIds: ["source-stoke-hot-fire"],
  dedupeKey: "stoke-space-hot-fire-2026-06-01",
  noveltyStatus: "new",
  confidence: 0.72,
};

const source: Source = {
  id: "source-stoke-hot-fire",
  url: "https://example.com/stoke-hot-fire",
  title: "Stoke Space completes full-duration engine hot-fire test",
  publisher: "Example Aerospace Trade",
  publishedAt: "2026-06-01T12:00:00.000Z",
  retrievedAt: "2026-06-07T00:00:00.000Z",
  sourceType: "trade_media",
  confidence: 0.72,
  notes: "Inline test source.",
};

describe("brief generator", () => {
  it("creates a deterministic editorial brief from a candidate signal and source", () => {
    const brief = generateEditorialBrief(signal, [source]);

    expect(brief).toEqual({
      id: "brief-signal-stoke-hot-fire",
      candidateSignalId: "signal-stoke-hot-fire",
      trackingObjectId: "tracking-stoke-space",
      briefTitle: "Stoke Space completes full-duration engine hot-fire test",
      factSummary:
        "A technical project milestone signal reports: A reported full-duration engine hot-fire suggests progress toward reusable launch vehicle milestones.",
      sourceSummary:
        "Supported by 1 source: Example Aerospace Trade - Stoke Space completes full-duration engine hot-fire test.",
      mapContext: null,
      whyItMatters:
        "This new signal may affect editorial coverage of the tracked aerospace company or project because it has 72% source confidence.",
      possibleAngles: [
        "Technical milestone brief",
        "Company/project tracking update",
        "Source-backed explainer",
      ],
      openQuestions: [
        "Can the claim be confirmed by an official or regulator source?",
        "What changed compared with the last known status?",
      ],
      riskNotes: ["Confidence is 72%; verify claims before publication."],
      locationAnchorIds: [],
      status: "ready_for_screening",
      createdAt: "2026-06-07T00:00:00.000Z",
    });
  });

  it("throws a clear error when no source is provided", () => {
    expect(() => generateEditorialBrief(signal, [])).toThrow(
      "Cannot generate editorial brief without at least one source",
    );
  });

  it("throws a clear error when the candidate signal has no source ids", () => {
    const sourceLessSignal: CandidateSignal = {
      ...signal,
      id: "signal-without-source-ids",
      sourceIds: [],
    };

    expect(() => generateEditorialBrief(sourceLessSignal, [source])).toThrow(
      "Cannot generate editorial brief for a candidate signal without source ids",
    );
  });
});
