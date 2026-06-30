import type { EditorialBrief } from "@/lib/domain/types";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { BriefViewModel } from "@/components/workbench/briefings-section";
import type { PoolItemViewModel } from "@/components/workbench/topic-pool-panel";
import { compositeScoreFor, deriveBriefUiStatus, signalKind } from "@/components/workbench/helpers";

/** Enrich a brief with everything the cards/tables display. */
export function buildBriefViewModel(state: LocalWorkflowState, brief: EditorialBrief): BriefViewModel {
  const signal = state.candidateSignals.find((item) => item.id === brief.candidateSignalId);
  const uiStatus = deriveBriefUiStatus(brief, state.screeningDecisions);

  return {
    brief,
    uiStatus,
    score: compositeScoreFor(brief.id, state.contentValueScores),
    kind: signal ? signalKind(signal) : "milestone",
    sourceCount: signal?.sourceIds.length ?? 0,
    locationCount: brief.locationAnchorIds.length,
    rejectReason:
      uiStatus === "rejected"
        ? state.screeningDecisions.find((decision) => decision.editorialBriefId === brief.id)?.reason
        : undefined,
    poolTitle:
      uiStatus === "pool"
        ? state.topicCards.find((topicCard) => topicCard.sourceEditorialBriefId === brief.id)?.workingTitle
        : undefined,
    observationDimensions:
      uiStatus === "watch"
        ? state.screeningDecisions.find((decision) => decision.editorialBriefId === brief.id)?.observationDimensions
        : undefined,
  };
}

export function buildPoolItems(state: LocalWorkflowState): PoolItemViewModel[] {
  return state.topicCards
    .map((topicCard) => {
      const brief = state.editorialBriefs.find((item) => item.id === topicCard.sourceEditorialBriefId);
      const decision = state.screeningDecisions.find(
        (item) => item.editorialBriefId === topicCard.sourceEditorialBriefId,
      );

      return {
        topicCard,
        score: compositeScoreFor(topicCard.sourceEditorialBriefId, state.contentValueScores),
        createdAt: brief?.createdAt ?? "",
        decidedAt: decision?.decidedAt ?? "",
        addedBy: state.teamMembers.find((member) => member.id === decision?.decidedBy),
        owner: state.teamMembers.find((member) => member.id === topicCard.ownerId),
      } satisfies PoolItemViewModel;
    })
    // 最新入选题库的排最前；同一时间再按价值分降序
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt) || b.score - a.score);
}

export function getSignalCounts(state: LocalWorkflowState): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const signal of state.candidateSignals) {
    counts[signal.trackingObjectId] = (counts[signal.trackingObjectId] ?? 0) + 1;
  }

  return counts;
}

export function getBriefIdBySignal(state: LocalWorkflowState): Record<string, string> {
  const map: Record<string, string> = {};

  for (const brief of state.editorialBriefs) {
    if (!map[brief.candidateSignalId]) {
      map[brief.candidateSignalId] = brief.id;
    }
  }

  return map;
}

export function getTotalPending(state: LocalWorkflowState): number {
  return state.editorialBriefs.filter((brief) => deriveBriefUiStatus(brief, state.screeningDecisions) === "pending")
    .length;
}
