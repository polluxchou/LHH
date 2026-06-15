import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MySpace, SpaceInvite, SpaceMember } from "@/lib/domain/account";

export async function getSessionUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user; // null if not logged in
}

interface MySpaceRow {
  role: "admin" | "member";
  spaces: {
    id: string;
    application_id: string;
    name: string;
    theme: string;
    applications: { owner_id: string };
  };
}

export async function getMySpaces(): Promise<MySpace[]> {
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return [];
  const { data, error } = await supabase
    .from("space_members")
    .select("role, spaces!inner(id, application_id, name, theme, applications!inner(owner_id))");
  if (error || !data) return [];
  const rows = data as unknown as MySpaceRow[];
  return rows.map((row) => ({
    space: {
      id: row.spaces.id,
      applicationId: row.spaces.application_id,
      name: row.spaces.name,
      theme: row.spaces.theme,
    },
    role: row.role,
    isOwner: row.spaces.applications.owner_id === user.user!.id,
  }));
}

interface MemberRow {
  id: string;
  space_id: string;
  user_id: string;
  role: "admin" | "member";
  title: string;
}
interface ProfileRow {
  id: string;
  display_name: string;
  avatar_char: string;
  color: string;
}

export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const supabase = await createSupabaseServerClient();
  // No direct FK from space_members → profiles (both reference auth.users), so PostgREST
  // can't auto-embed. Fetch members and their profiles separately, then join in code.
  const { data: memberData } = await supabase
    .from("space_members")
    .select("id, space_id, user_id, role, title")
    .eq("space_id", spaceId);
  const rows = (memberData ?? []) as unknown as MemberRow[];
  if (rows.length === 0) return [];
  const userIds = rows.map((r) => r.user_id);
  const { data: profileData } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_char, color")
    .in("id", userIds);
  const profs = (profileData ?? []) as unknown as ProfileRow[];
  const byId = new Map(profs.map((p) => [p.id, p]));
  return rows.map((r): SpaceMember => {
    const p = byId.get(r.user_id);
    return {
      id: r.id, spaceId: r.space_id, userId: r.user_id, role: r.role, title: r.title,
      profile: {
        id: r.user_id,
        displayName: p?.display_name ?? "",
        avatarChar: p?.avatar_char ?? "·",
        color: p?.color ?? "#888888",
      },
    };
  });
}

export interface InviteRow {
  id: string;
  space_id: string;
  email: string;
  token: string;
  role: "admin" | "member";
  invited_by: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
}

export async function getPendingInvites(spaceId: string): Promise<SpaceInvite[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("space_invites")
    .select("*")
    .eq("space_id", spaceId)
    .eq("status", "pending");
  return ((data ?? []) as unknown as InviteRow[]).map(mapInviteRow);
}

export function mapInviteRow(r: InviteRow): SpaceInvite {
  return {
    id: r.id, spaceId: r.space_id, email: r.email, token: r.token, role: r.role,
    invitedBy: r.invited_by, status: r.status, expiresAt: r.expires_at,
    createdAt: r.created_at, acceptedAt: r.accepted_at,
  };
}
