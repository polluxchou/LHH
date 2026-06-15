import { describe, expect, it } from "vitest";
import { evaluateInvite, canAcceptInvite, generateInviteToken } from "@/lib/account/invite";
import type { SpaceInvite } from "@/lib/domain/account";

const base: SpaceInvite = {
  id: "i1",
  spaceId: "s1",
  email: "new@x.com",
  token: "tok",
  role: "member",
  invitedBy: "u1",
  status: "pending",
  expiresAt: "2026-06-20T00:00:00.000Z",
  createdAt: "2026-06-14T00:00:00.000Z",
  acceptedAt: null,
};
const NOW = "2026-06-15T00:00:00.000Z";

describe("evaluateInvite", () => {
  it("returns valid for a pending, unexpired invite", () => {
    expect(evaluateInvite(base, NOW)).toEqual({ ok: true });
  });
  it("flags expired when past expires_at", () => {
    expect(evaluateInvite({ ...base, expiresAt: "2026-06-14T12:00:00.000Z" }, NOW))
      .toEqual({ ok: false, reason: "expired" });
  });
  it("flags revoked invites", () => {
    expect(evaluateInvite({ ...base, status: "revoked" }, NOW)).toEqual({ ok: false, reason: "revoked" });
  });
  it("flags already-accepted invites", () => {
    expect(evaluateInvite({ ...base, status: "accepted" }, NOW)).toEqual({ ok: false, reason: "accepted" });
  });
});

describe("canAcceptInvite", () => {
  it("allows when session email matches (case-insensitive)", () => {
    expect(canAcceptInvite(base, "NEW@x.com", NOW)).toEqual({ ok: true });
  });
  it("blocks when session email differs", () => {
    expect(canAcceptInvite(base, "other@x.com", NOW)).toEqual({ ok: false, reason: "email_mismatch" });
  });
  it("blocks an expired invite even with matching email", () => {
    expect(canAcceptInvite({ ...base, expiresAt: "2026-06-14T00:00:00.000Z" }, "new@x.com", NOW))
      .toEqual({ ok: false, reason: "expired" });
  });
});

describe("generateInviteToken", () => {
  it("produces a URL-safe token of reasonable length", () => {
    const t = generateInviteToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});
