"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Locale } from "@/lib/i18n/copy";

export function LoginForm({ locale, next }: { locale: Locale; next?: string }) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { email: "邮箱", send: "发送验证码", code: "验证码", verify: "登录", sent: "验证码已发送，请查收邮箱" }
    : { email: "Email", send: "Send code", code: "Code", verify: "Sign in", sent: "Code sent — check your inbox" };

  async function send() {
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setError(error.message); else setSent(true);
  }
  async function verify() {
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) { setError(error.message); return; }
    router.replace(next ?? (locale === "zh" ? "/zh" : "/"));
    router.refresh();
  }

  return (
    <div className="auth-card">
      <label>{t.email}<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></label>
      {!sent ? (
        <button onClick={send} disabled={!email}>{t.send}</button>
      ) : (
        <>
          <p>{t.sent}</p>
          <label>{t.code}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" /></label>
          <button onClick={verify} disabled={!code}>{t.verify}</button>
        </>
      )}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
