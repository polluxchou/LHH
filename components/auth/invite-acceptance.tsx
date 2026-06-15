"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { acceptInvite } from "@/lib/account/mutations";

const COLORS = ["#8b5e3c", "#2d2d5e", "#1890ff", "#c0392b", "#16a085"];

export function InviteAcceptance({ token, inviteEmail, sessionEmail, defaultName }: {
  token: string; inviteEmail: string; sessionEmail: string | null; defaultName: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = !!sessionEmail && sessionEmail.toLowerCase() === inviteEmail.toLowerCase();

  async function sendCode() {
    setError(null); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: inviteEmail, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }
  async function verify() {
    setError(null); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: inviteEmail, token: code, type: "email" });
    setBusy(false);
    if (error) setError(error.message); else router.refresh();
  }
  async function accept() {
    setError(null); setBusy(true);
    try {
      const { spaceId } = await acceptInvite(token, {
        displayName: name, avatarChar: name[0] ?? "·", color: COLORS[name.length % COLORS.length],
      });
      router.replace(`/zh/?space=${spaceId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setBusy(false);
    }
  }

  if (!matches) {
    if (sessionEmail) {
      return <p className="auth-error">此邀请发给 {inviteEmail}，请用该邮箱登录后再打开此链接。</p>;
    }
    return (
      <div className="invite-accept">
        <p className="muted">用 <b>{inviteEmail}</b> 登录以接受邀请</p>
        {!sent ? (
          <button type="button" onClick={sendCode} disabled={busy}>发送验证码</button>
        ) : (
          <>
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="验证码" />
            <button type="button" onClick={verify} disabled={!code || busy}>验证</button>
          </>
        )}
        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="invite-accept">
      <label>显示名
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="button" onClick={accept} disabled={!name || busy}>接受邀请</button>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
