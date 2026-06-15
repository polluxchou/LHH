import { describe, expect, it } from "vitest";
import { canCreateSpace, canManageMembers, canIssueInvite } from "@/lib/account/permissions";

describe("permissions", () => {
  it("only owner can create spaces", () => {
    expect(canCreateSpace({ isOwner: true, role: "member" })).toBe(true);
    expect(canCreateSpace({ isOwner: false, role: "admin" })).toBe(false);
  });
  it("owner or space admin can manage members", () => {
    expect(canManageMembers({ isOwner: true, role: "member" })).toBe(true);
    expect(canManageMembers({ isOwner: false, role: "admin" })).toBe(true);
    expect(canManageMembers({ isOwner: false, role: "member" })).toBe(false);
  });
  it("admins may issue member invites but only owner may issue admin invites", () => {
    expect(canIssueInvite({ isOwner: false, role: "admin" }, "member")).toBe(true);
    expect(canIssueInvite({ isOwner: false, role: "admin" }, "admin")).toBe(false);
    expect(canIssueInvite({ isOwner: true, role: "member" }, "admin")).toBe(true);
    expect(canIssueInvite({ isOwner: false, role: "member" }, "member")).toBe(false);
  });
});
