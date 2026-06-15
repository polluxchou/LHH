"use client";
import { useState } from "react";
import { createInvite, revokeInvite } from "@/lib/account/mutations";

export function InviteDialog({ spaceId, canInviteAdmin, locale }: { spaceId: string; canInviteAdmin: boolean; locale: "en" | "zh" }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { email: "受邀邮箱", invite: "生成邀请链接", copy: "复制", copied: "已复制", admin: "设为管理员", hint: "把链接发给对方；对方需用该邮箱登录后接受。" }
    : { email: "Invitee email", invite: "Create invite link", copy: "Copy", copied: "Copied", admin: "As admin", hint: "Send the link; they must sign in with that email to accept." };

  async function submit() {
    setError(null); setBusy(true); setLink(null);
    try {
      const res = await createInvite({ spaceId, email, role });
      setLink(res.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="invite-dialog">
      <div className="invite-row">
        <input type="email" value={email} placeholder={t.email} onChange={(e) => setEmail(e.target.value)} />
        {canInviteAdmin ? (
          <label className="invite-admin">
            <input type="checkbox" checked={role === "admin"} onChange={(e) => setRole(e.target.checked ? "admin" : "member")} /> {t.admin}
          </label>
        ) : null}
        <button type="button" onClick={submit} disabled={!email || busy}>{t.invite}</button>
      </div>
      {link ? (
        <div className="invite-link">
          <code>{link}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(link)}>{t.copy}</button>
          <p className="invite-hint">{t.hint}</p>
        </div>
      ) : null}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}

export function RevokeInviteButton({ inviteId, spaceId, label }: { inviteId: string; spaceId: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="link-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await revokeInvite(inviteId, spaceId); location.reload(); } catch { setBusy(false); }
      }}
    >
      {label}
    </button>
  );
}
