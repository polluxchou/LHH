import { createInitialWorkflowState, type LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { SpaceMember } from "@/lib/domain/account";
import type { TeamMember } from "@/lib/domain/types";

/** Fixture-member-id → 聊太空 member DISPLAY NAME (stable across uuid churn). */
export const LIN_HAHA_MEMBER_MAP: Record<string, string> = {
  "u-lin": "林哈哈",
  "u-zhou": "周野",
  "u-he": "何远",
};

interface SeedArgs {
  members: SpaceMember[];
  currentUserId: string;
  /**
   * Explicit fixture-id → display-name map. Only the seeded 聊太空 space passes this;
   * its presence means "clone the demo fixtures into this space". Newly created spaces
   * omit it and start EMPTY (no tracking objects / signals / briefs).
   */
  contentMemberMap?: Record<string, string>;
}

function toTeamMember(m: SpaceMember, trackingObjectIds: string[]): TeamMember {
  return {
    id: m.userId,
    name: m.profile.displayName,
    role: m.title,
    avatarChar: m.profile.avatarChar,
    color: m.profile.color,
    trackingObjectIds,
  };
}

export function seedSpaceContent({ members, currentUserId, contentMemberMap }: SeedArgs): LocalWorkflowState {
  const realIds = new Set(members.map((m) => m.userId));
  const currentMemberId = realIds.has(currentUserId) ? currentUserId : (members[0]?.userId ?? currentUserId);
  const base = createInitialWorkflowState();

  // ── New space → start empty (members only, no cloned content) ──
  if (!contentMemberMap) {
    return {
      ...base,
      teamMembers: members.map((m) => toTeamMember(m, [])),
      currentMemberId,
      trackingObjects: [],
      searchRuns: [],
      sources: [],
      candidateSignals: [],
      editorialBriefs: [],
      contentValueScores: [],
      screeningDecisions: [],
      topicCards: [],
      locationAnchors: [],
      productionDrafts: {},
      selectedTrackingObjectId: "",
      activeBriefId: null,
      lastFeedback: null,
      runLog: [],
    };
  }

  // ── 聊太空 → clone the demo fixtures, remapping member references by display name ──
  const fixtureMembers = base.teamMembers;
  const byName: Record<string, string> = {};
  for (const m of members) byName[m.profile.displayName] = m.userId;
  const map: Record<string, string> = {};
  for (const [fixtureId, name] of Object.entries(contentMemberMap)) {
    if (byName[name]) map[fixtureId] = byName[name];
  }
  const remapId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const mapped = map[id] ?? id;
    return realIds.has(mapped) ? mapped : (members[0]?.userId ?? null);
  };

  const subsByReal: Record<string, Set<string>> = {};
  for (const fm of fixtureMembers) {
    const real = map[fm.id];
    if (!real) continue;
    subsByReal[real] = new Set([...(subsByReal[real] ?? []), ...fm.trackingObjectIds]);
  }
  const teamMembers = members.map((m) => toTeamMember(m, [...(subsByReal[m.userId] ?? [])]));

  return {
    ...base,
    teamMembers,
    currentMemberId,
    topicCards: base.topicCards.map((c) => ({ ...c, ownerId: remapId(c.ownerId) })),
    screeningDecisions: base.screeningDecisions.map((d) => ({
      ...d,
      decidedBy: remapId(d.decidedBy) ?? d.decidedBy,
    })),
  };
}
