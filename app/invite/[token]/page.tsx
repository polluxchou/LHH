import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mapInviteRow, getSessionUser, type InviteRow } from "@/lib/account/queries";
import { evaluateInvite } from "@/lib/account/invite";
import { InviteAcceptance } from "@/components/auth/invite-acceptance";

const REASON_TEXT: Record<string, string> = {
  expired: "邀请已过期 / Invite expired",
  revoked: "邀请已撤销 / Invite revoked",
  accepted: "邀请已被接受 / Invite already accepted",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from("space_invites")
    .select("*, spaces!inner(name, theme)")
    .eq("token", token)
    .single();

  if (!row) {
    return <main className="auth-page"><div className="auth-card"><p>邀请不存在 / Invite not found</p></div></main>;
  }
  const invite = mapInviteRow(row as unknown as InviteRow);
  const check = evaluateInvite(invite, new Date().toISOString());
  if (!check.ok) {
    return <main className="auth-page"><div className="auth-card"><p>{REASON_TEXT[check.reason]}</p></div></main>;
  }

  const space = (row as unknown as { spaces: { name: string; theme: string } }).spaces;
  const user = await getSessionUser();

  return (
    <main className="auth-page">
      <div className="auth-card invite-card">
        <p className="invite-kicker">你被邀请加入</p>
        <h1>{space.name}</h1>
        {space.theme ? <p className="invite-theme">{space.theme}</p> : null}
        <p className="invite-role">{invite.role === "admin" ? "管理员 · Admin" : "成员 · Member"}</p>
        <InviteAcceptance
          token={token}
          inviteEmail={invite.email}
          sessionEmail={user?.email ?? null}
          defaultName={invite.email.split("@")[0]}
        />
      </div>
    </main>
  );
}
