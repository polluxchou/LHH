import type { SpaceInvite } from "@/lib/domain/account";

export type InviteCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "revoked" | "accepted" | "email_mismatch" };

export function evaluateInvite(invite: SpaceInvite, nowIso: string): InviteCheck {
  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "accepted") return { ok: false, reason: "accepted" };
  if (new Date(invite.expiresAt).getTime() <= new Date(nowIso).getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

export function canAcceptInvite(invite: SpaceInvite, sessionEmail: string, nowIso: string): InviteCheck {
  const valid = evaluateInvite(invite, nowIso);
  if (!valid.ok) return valid;
  if (invite.email.trim().toLowerCase() !== sessionEmail.trim().toLowerCase()) {
    return { ok: false, reason: "email_mismatch" };
  }
  return { ok: true };
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}
