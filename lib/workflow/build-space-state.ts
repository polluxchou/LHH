import { fid } from "@/lib/workflow/fixture-ids";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { SpaceContent } from "@/lib/account/content-queries";
import type { SpaceMember } from "@/lib/domain/account";
import type { TeamMember } from "@/lib/domain/types";
import {
  screeningDecisions as fxDecisions,
  topicCards as fxTopicCards,
  locationAnchors as fxAnchors,
  productions as fxProductions,
} from "@/lib/data/phase1-fixtures";

/** fixture member id → 林哈哈聊太空 display name (to resolve real user ids in the demo overlay). */
const FIXTURE_MEMBER_NAMES: Record<string, string> = { "u-lin": "林哈哈", "u-zhou": "周野", "u-he": "何远" };

interface BuildArgs {
  dbContent: SpaceContent;
  members: SpaceMember[];
  currentUserId: string;
  /** true only for the seeded 林哈哈聊太空 space — adds the curated editorial overlay. */
  isDemoSpace: boolean;
  /** per-user subscriptions ("我关注的") from DB → { userId: trackingObjectId[] } */
  subscriptionsByUser?: Record<string, string[]>;
}

/**
 * SERVER-ONLY (uses fid → node:crypto). Builds the workbench state for a space:
 * DB-backed content (objects/signals/sources/briefs/scores/runs) as the base, plus,
 * for the demo space, the in-memory editorial overlay (decisions/topic_cards/
 * productions/anchors) seeded from fixtures with every id remapped through fid() so
 * it aligns with the migrated DB rows.
 */
export function buildSpaceState({ dbContent, members, currentUserId, isDemoSpace, subscriptionsByUser }: BuildArgs): LocalWorkflowState {
  const realIds = new Set(members.map((m) => m.userId));
  const currentMemberId = realIds.has(currentUserId) ? currentUserId : (members[0]?.userId ?? currentUserId);
  const byName: Record<string, string> = {};
  for (const m of members) byName[m.profile.displayName] = m.userId;
  const memberRemap = (fixtureMemberId: string): string => {
    const name = FIXTURE_MEMBER_NAMES[fixtureMemberId];
    return (name && byName[name]) || members[0]?.userId || fixtureMemberId;
  };

  // "我关注的" subscriptions come from DB (persisted per user); fall back to empty.
  const subs = subscriptionsByUser ?? {};
  const teamMembers: TeamMember[] = members.map((m) => ({
    id: m.userId, name: m.profile.displayName, role: m.title, avatarChar: m.profile.avatarChar,
    color: m.profile.color, trackingObjectIds: subs[m.userId] ?? [],
  }));

  const base: LocalWorkflowState = {
    teamMembers,
    currentMemberId,
    trackingObjects: dbContent.trackingObjects,
    searchRuns: dbContent.searchRuns,
    sources: dbContent.sources,
    candidateSignals: dbContent.candidateSignals,
    editorialBriefs: dbContent.editorialBriefs,
    contentValueScores: dbContent.contentValueScores,
    screeningDecisions: [],
    topicCards: [],
    locationAnchors: [],
    productionDrafts: {},
    articleDrafts: {},
    selectedTrackingObjectId: dbContent.trackingObjects[0]?.id ?? "",
    activeBriefId: null,
    lastFeedback: null,
    runLog: [],
  };

  if (!isDemoSpace) return base;

  return {
    ...base,
    screeningDecisions: fxDecisions.map((d) => ({
      ...d, editorialBriefId: fid(d.editorialBriefId), decidedBy: memberRemap(d.decidedBy),
    })),
    topicCards: fxTopicCards.map((t) => ({
      ...t, id: fid(t.id), sourceEditorialBriefId: fid(t.sourceEditorialBriefId),
      sourceIds: t.sourceIds.map(fid), ownerId: t.ownerId ? memberRemap(t.ownerId) : t.ownerId,
    })),
    locationAnchors: fxAnchors.map((a) => ({
      ...a, id: fid(a.id), relatedTrackingObjectIds: a.relatedTrackingObjectIds.map(fid),
      sourceIds: a.sourceIds.map(fid),
    })),
    productionDrafts: Object.fromEntries(
      Object.entries(fxProductions).map(([briefId, pkg]) => [fid(briefId), pkg]),
    ),
  };
}
