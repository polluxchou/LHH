"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Locale } from "@/lib/i18n/copy";

type Mode = "password" | "otp";

export function LoginForm({ locale, next }: { locale: Locale; next?: string }) {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { email: "邮箱", password: "密码", signin: "登录", send: "发送验证码", code: "验证码", sent: "验证码已发送，请查收邮箱", useOtp: "改用邮箱验证码登录", usePw: "用密码登录" }
    : { email: "Email", password: "Password", signin: "Sign in", send: "Send code", code: "Code", sent: "Code sent — check your inbox", useOtp: "Use email code instead", usePw: "Use password" };

  function done() {
    router.replace(next ?? (locale === "zh" ? "/zh" : "/"));
    router.refresh();
  }

  async function signInPassword() {
    setError(null); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message); else done();
  }
  async function send() {
    setError(null); setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    setBusy(false);
    if (error) setError(error.message); else setSent(true);
  }
  async function verify() {
    setError(null); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) { setError(error.message); return; }
    done();
  }

  return (
    <div className="auth-card">
      <label>{t.email}<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" /></label>

      {mode === "password" ? (
        <>
          <label>{t.password}
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === "Enter" && email && password) signInPassword(); }} />
          </label>
          <button onClick={signInPassword} disabled={!email || !password || busy}>{t.signin}</button>
          <button type="button" className="link-btn" onClick={() => { setMode("otp"); setError(null); }}>{t.useOtp}</button>
        </>
      ) : (
        <>
          {!sent ? (
            <button onClick={send} disabled={!email || busy}>{t.send}</button>
          ) : (
            <>
              <p className="muted">{t.sent}</p>
              <label>{t.code}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" /></label>
              <button onClick={verify} disabled={!code || busy}>{t.signin}</button>
            </>
          )}
          <button type="button" className="link-btn" onClick={() => { setMode("password"); setSent(false); setError(null); }}>{t.usePw}</button>
        </>
      )}

      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
