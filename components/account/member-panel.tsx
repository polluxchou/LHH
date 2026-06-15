import { getPendingInvites, getSpaceMembers } from "@/lib/account/queries";
import { InviteDialog, RevokeInviteButton } from "@/components/account/invite-dialog";
import type { SpaceRole } from "@/lib/domain/account";

export async function MemberPanel({ spaceId, actorRole, isOwner, locale }: {
  spaceId: string; actorRole: SpaceRole; isOwner: boolean; locale: "en" | "zh";
}) {
  const members = await getSpaceMembers(spaceId);
  const canManage = isOwner || actorRole === "admin";
  const invites = canManage ? await getPendingInvites(spaceId) : [];
  const roleTxt = (r: SpaceRole) => (locale === "zh" ? (r === "admin" ? "管理员" : "成员") : r === "admin" ? "Admin" : "Member");
  const t = locale === "zh"
    ? { members: "空间成员", invite: "邀请成员", pending: "待处理邀请", none: "暂无待处理邀请", revoke: "撤销" }
    : { members: "Space members", invite: "Invite member", pending: "Pending invites", none: "No pending invites", revoke: "Revoke" };

  return (
    <section className="member-panel">
      <h2>{t.members} <span className="member-count">{members.length}</span></h2>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id} className="member-row">
            <span className="uavatar" style={{ background: m.profile.color }}>{m.profile.avatarChar}</span>
            <span className="member-name">{m.profile.displayName}</span>
            <span className="member-title">{m.title}</span>
            <span className={`role-badge role-${m.role}`}>{roleTxt(m.role)}</span>
          </li>
        ))}
      </ul>

      {canManage ? (
        <>
          <h3>{t.invite}</h3>
          <InviteDialog spaceId={spaceId} canInviteAdmin={isOwner} locale={locale} />
          <h3>{t.pending}</h3>
          {invites.length === 0 ? (
            <p className="muted">{t.none}</p>
          ) : (
            <ul className="invite-list">
              {invites.map((i) => (
                <li key={i.id} className="invite-row-item">
                  <span className="invite-email">{i.email}</span>
                  <span className={`role-badge role-${i.role}`}>{roleTxt(i.role)}</span>
                  <RevokeInviteButton inviteId={i.id} spaceId={spaceId} label={t.revoke} />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
