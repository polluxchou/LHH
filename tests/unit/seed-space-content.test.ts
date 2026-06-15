import { describe, expect, it } from "vitest";
import { seedSpaceContent, LIN_HAHA_MEMBER_MAP } from "@/lib/workflow/seed-space-content";
import type { SpaceMember } from "@/lib/domain/account";

function member(userId: string, role: "admin" | "member", name: string): SpaceMember {
  return {
    id: `m-${userId}`, spaceId: "s1", userId, role, title: role === "admin" ? "管理员" : "成员",
    profile: { id: userId, displayName: name, avatarChar: name[0], color: "#123456" },
  };
}

describe("seedSpaceContent — 聊太空 (explicit map, name-based)", () => {
  // Real user ids are arbitrary uuids; the map resolves fixture ids → real ids by display name.
  const members = [member("uid-lin", "admin", "林哈哈"), member("uid-zhou", "member", "周野"), member("uid-he", "member", "何远")];
  const map = LIN_HAHA_MEMBER_MAP; // { "u-lin": "林哈哈", "u-zhou": "周野", "u-he": "何远" }

  it("replaces teamMembers with the real members", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-zhou", contentMemberMap: map });
    expect(state.teamMembers.map((m) => m.id).sort()).toEqual(["uid-he", "uid-lin", "uid-zhou"]);
    expect(state.currentMemberId).toBe("uid-zhou");
  });

  it("remaps topic-card ownerId from fixture id to real id", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-lin", contentMemberMap: map });
    const ids = new Set(["uid-lin", "uid-zhou", "uid-he"]);
    for (const card of state.topicCards) {
      if (card.ownerId) expect(ids.has(card.ownerId)).toBe(true);
    }
  });

  it("carries fixture subscriptions onto the mapped member", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-lin", contentMemberMap: map });
    const lin = state.teamMembers.find((m) => m.id === "uid-lin")!;
    expect(lin.trackingObjectIds.length).toBeGreaterThan(0);
  });
});

describe("seedSpaceContent — new space (starts empty)", () => {
  const members = [member("uid-a", "admin", "甲"), member("uid-b", "member", "乙")];

  it("has the real members but no cloned content", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-a" });
    expect(state.teamMembers.map((m) => m.id)).toEqual(["uid-a", "uid-b"]);
    expect(state.currentMemberId).toBe("uid-a");
    // no 聊太空 demo data leaks into a fresh space
    expect(state.trackingObjects).toEqual([]);
    expect(state.candidateSignals).toEqual([]);
    expect(state.editorialBriefs).toEqual([]);
    expect(state.topicCards).toEqual([]);
    expect(state.locationAnchors).toEqual([]);
  });

  it("gives new-space members empty subscriptions", () => {
    const state = seedSpaceContent({ members, currentUserId: "uid-a" });
    expect(state.teamMembers.every((m) => m.trackingObjectIds.length === 0)).toBe(true);
  });
});
