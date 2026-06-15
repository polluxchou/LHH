import type { CandidateSignal, EditorialBrief, Source } from "@/lib/domain/types";

const DEFAULT_CREATED_AT = "2026-06-07T00:00:00.000Z";

const signalTypeLabels: Record<CandidateSignal["signalType"], string> = {
  technical_project_milestone: "technical project milestone",
  location_facility_change: "location facility change",
  policy_regulatory_change: "policy regulatory change",
};

const angleBySignalType: Record<CandidateSignal["signalType"], string> = {
  technical_project_milestone: "Technical milestone brief",
  location_facility_change: "Location and facility update",
  policy_regulatory_change: "Policy/regulatory explainer",
};

export interface GenerateEditorialBriefOptions {
  createdAt?: string;
  locationAnchorIds?: string[];
  mapContext?: string | null;
}

export function generateEditorialBrief(
  candidateSignal: CandidateSignal,
  sourceRecords: Source[],
  options: GenerateEditorialBriefOptions = {},
): EditorialBrief {
  if (sourceRecords.length === 0) {
    throw new Error("Cannot generate editorial brief without at least one source");
  }

  if (candidateSignal.sourceIds.length === 0) {
    throw new Error("Cannot generate editorial brief for a candidate signal without source ids");
  }

  const matchingSources = sourceRecords.filter((source) => candidateSignal.sourceIds.includes(source.id));

  if (matchingSources.length === 0) {
    throw new Error("Cannot generate editorial brief without a source matching the candidate signal");
  }

  const sourceSummary = matchingSources
    .map((source) => `${source.publisher ?? "Unknown publisher"} - ${source.title}`)
    .join("; ");
  const confidencePercent = Math.round(candidateSignal.confidence * 100);

  return {
    id: `brief-${candidateSignal.id}`,
    candidateSignalId: candidateSignal.id,
    trackingObjectId: candidateSignal.trackingObjectId,
    briefTitle: candidateSignal.headline,
    factSummary: `A ${signalTypeLabels[candidateSignal.signalType]} signal reports: ${candidateSignal.summary}`,
    sourceSummary: `Supported by ${matchingSources.length} source${matchingSources.length === 1 ? "" : "s"}: ${sourceSummary}.`,
    mapContext: options.mapContext ?? null,
    whyItMatters: `This ${candidateSignal.noveltyStatus} signal may affect editorial coverage of the tracked aerospace company or project because it has ${confidencePercent}% source confidence.`,
    possibleAngles: [
      angleBySignalType[candidateSignal.signalType],
      "Company/project tracking update",
      "Source-backed explainer",
    ],
    openQuestions: [
      "Can the claim be confirmed by an official or regulator source?",
      "What changed compared with the last known status?",
    ],
    riskNotes: [`Confidence is ${confidencePercent}%; verify claims before publication.`],
    locationAnchorIds: options.locationAnchorIds ?? [],
    status: "ready_for_screening",
    createdAt: options.createdAt ?? DEFAULT_CREATED_AT,
  };
}
