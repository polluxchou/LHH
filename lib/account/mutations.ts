"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateInviteToken, canAcceptInvite } from "@/lib/account/invite";
import { canCreateSpace, canIssueInvite, type ActorContext } from "@/lib/account/permissions";
import { getMySpaces, mapInviteRow, type InviteRow } from "@/lib/account/queries";
import type { SpaceRole } from "@/lib/domain/account";

async function actorFor(spaceId: string): Promise<ActorContext | null> {
  const mine = await getMySpaces();
  const match = mine.find((m) => m.space.id === spaceId);
  return match ? { isOwner: match.isOwner, role: match.role } : null;
}

export async function createInvite(input: { spaceId: string; email: string; role: SpaceRole }) {
  const actor = await actorFor(input.spaceId);
  if (!actor || !canIssueInvite(actor, input.role)) throw new Error("forbidden");
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  // revoke any existing pending invite for the same (space,email) first
  await supabase.from("space_invites").update({ status: "revoked" })
    .eq("space_id", input.spaceId).eq("email", input.email.trim().toLowerCase()).eq("status", "pending");
  const { data, error } = await supabase.from("space_invites").insert({
    space_id: input.spaceId, email: input.email.trim().toLowerCase(), token,
    role: input.role, invited_by: user.user!.id, expires_at: expiresAt,
  }).select("*").single();
  if (error) throw new Error(error.message);
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/invite/${token}`;
  return { invite: mapInviteRow(data as unknown as InviteRow), link };
}

export async function revokeInvite(inviteId: string, spaceId: string) {
  const actor = await actorFor(spaceId);
  if (!actor) throw new Error("forbidden");
  const supabase = await createSupabaseServerClient();
  await supabase.from("space_invites").update({ status: "revoked" }).eq("id", inviteId);
}

export async function acceptInvite(token: string, profile: { displayName: string; avatarChar: string; color: string }) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("not_authenticated");

  const admin = createSupabaseAdminClient();
  const { data: row } = await admin.from("space_invites").select("*").eq("token", token).single();
  if (!row) throw new Error("invite_not_found");
  const invite = mapInviteRow(row as unknown as InviteRow);
  const check = canAcceptInvite(invite, user.email ?? "", new Date().toISOString());
  if (!check.ok) throw new Error(check.reason);

  // ensure profile, add membership, close invite — all via admin (bypasses RLS deliberately)
  await admin.from("profiles").upsert({
    id: user.id, display_name: profile.displayName, avatar_char: profile.avatarChar, color: profile.color,
  });
  await admin.from("space_members").insert({
    space_id: invite.spaceId, user_id: user.id, role: invite.role,
    title: invite.role === "admin" ? "管理员" : "成员",
  });
  await admin.from("space_invites").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", invite.id);
  return { spaceId: invite.spaceId };
}

export async function createSpace(input: { name: string; theme: string; adminUserId?: string; adminEmail?: string }) {
  const mine = await getMySpaces();
  const owner = mine.find((m) => m.isOwner) ?? null;
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  // owner gate: the user must own an application
  const { data: app } = await supabase.from("applications").select("id, owner_id").eq("owner_id", user.user!.id).single();
  if (!app) throw new Error("forbidden");
  if (!canCreateSpace({ isOwner: true, role: owner?.role ?? "member" })) throw new Error("forbidden");

  // Ownership is already enforced above (the RLS-scoped applications lookup only returns
  // the caller's own app), so the writes go through the admin client.
  const admin = createSupabaseAdminClient();
  const { data: space, error } = await admin.from("spaces")
    .insert({ application_id: app.id, name: input.name, theme: input.theme }).select("*").single();
  if (error) throw new Error(error.message);

  // The owner always joins the space they create, so it appears in their workbench and
  // stays manageable. They take the admin seat only when no separate admin is assigned
  // (preserves the one-admin-per-space invariant).
  const ownerRole: SpaceRole = input.adminUserId || input.adminEmail ? "member" : "admin";
  await admin.from("space_members").insert({
    space_id: space.id, user_id: user.user!.id, role: ownerRole, title: "所有者",
  });

  if (input.adminUserId) {
    // existing account → assign admin directly
    await admin.from("space_members").insert({ space_id: space.id, user_id: input.adminUserId, role: "admin", title: "管理员" });
  } else if (input.adminEmail) {
    // new person → owner-issued admin invite (becomes admin on acceptance)
    await createInvite({ spaceId: space.id, email: input.adminEmail, role: "admin" });
  }
  return { spaceId: space.id };
}
