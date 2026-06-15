import type { SpaceRole } from "@/lib/domain/account";

export interface ActorContext {
  isOwner: boolean;
  role: SpaceRole;
}

export function canCreateSpace(actor: ActorContext): boolean {
  return actor.isOwner;
}

export function canManageMembers(actor: ActorContext): boolean {
  return actor.isOwner || actor.role === "admin";
}

export function canIssueInvite(actor: ActorContext, inviteRole: SpaceRole): boolean {
  if (inviteRole === "admin") return actor.isOwner;
  return canManageMembers(actor);
}
