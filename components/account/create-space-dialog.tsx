"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSpace } from "@/lib/account/mutations";

export function CreateSpaceDialog({ locale }: { locale: "en" | "zh" }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = locale === "zh"
    ? { name: "空间名称", theme: "内容主题", admin: "管理员邮箱（可选，留空则你任管理员）", create: "创建空间", hint: "填邮箱将向对方发出管理员邀请；对方接受后成为该空间管理员。" }
    : { name: "Space name", theme: "Content theme", admin: "Admin email (optional; you become admin if blank)", create: "Create space", hint: "An admin invite is sent to that email; they become admin on acceptance." };

  async function submit() {
    setError(null); setBusy(true);
    try {
      const { spaceId } = await createSpace({ name, theme, adminEmail: adminEmail || undefined });
      setName(""); setTheme(""); setAdminEmail("");
      router.push(`${locale === "zh" ? "/zh" : ""}/?space=${spaceId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "error");
      setBusy(false);
    }
  }

  return (
    <div className="create-space">
      <input value={name} placeholder={t.name} onChange={(e) => setName(e.target.value)} />
      <input value={theme} placeholder={t.theme} onChange={(e) => setTheme(e.target.value)} />
      <input type="email" value={adminEmail} placeholder={t.admin} onChange={(e) => setAdminEmail(e.target.value)} />
      <button type="button" onClick={submit} disabled={!name || busy}>{t.create}</button>
      <p className="invite-hint">{t.hint}</p>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
