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
  /** explicit fixture-id → display-name map (聊太空). Omit for new spaces (heuristic). */
  contentMemberMap?: Record<string, string>;
}

export function seedSpaceContent({ members, currentUserId, contentMemberMap }: SeedArgs): LocalWorkflowState {
  const fixtureState = createInitialWorkflowState();
  const fixtureMembers = fixtureState.teamMembers;

  // Build fixtureMemberId → realUserId.
  const map: Record<string, string> = {};
  if (contentMemberMap) {
    // Resolve fixture id → display name → real user id.
    const byName: Record<string, string> = {};
    for (const m of members) byName[m.profile.displayName] = m.userId;
    for (const [fixtureId, name] of Object.entries(contentMemberMap)) {
      if (byName[name]) map[fixtureId] = byName[name];
    }
  } else {
    // Heuristic: admin first, then members round-robin over fixture slots.
    const ordered = [...members].sort((a, b) => (a.role === "admin" ? -1 : 0) - (b.role === "admin" ? -1 : 0));
    fixtureMembers.forEach((fm, i) => {
      if (ordered.length > 0) map[fm.id] = ordered[i % ordered.length].userId;
    });
  }
  const realIds = new Set(members.map((m) => m.userId));
  const remapId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const mapped = map[id] ?? id;
    return realIds.has(mapped) ? mapped : (members[0]?.userId ?? null);
  };

  // Real members in TeamMember shape, inheriting fixture subscriptions through the map.
  const subsByReal: Record<string, Set<string>> = {};
  for (const fm of fixtureMembers) {
    const real = map[fm.id];
    if (!real) continue;
    subsByReal[real] = new Set([...(subsByReal[real] ?? []), ...fm.trackingObjectIds]);
  }
  const teamMembers: TeamMember[] = members.map((m) => ({
    id: m.userId,
    name: m.profile.displayName,
    role: m.title,
    avatarChar: m.profile.avatarChar,
    color: m.profile.color,
    trackingObjectIds: [...(subsByReal[m.userId] ?? [])],
  }));

  return {
    ...fixtureState,
    teamMembers,
    currentMemberId: realIds.has(currentUserId) ? currentUserId : (members[0]?.userId ?? currentUserId),
    topicCards: fixtureState.topicCards.map((c) => ({ ...c, ownerId: remapId(c.ownerId) })),
    screeningDecisions: fixtureState.screeningDecisions.map((d) => ({
      ...d,
      decidedBy: remapId(d.decidedBy) ?? d.decidedBy,
    })),
  };
}
