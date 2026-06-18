"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSpaceSession } from "@/components/account/space-provider";
import { getCopy } from "@/lib/i18n/copy";

export function AccountMenu({ locale }: { locale: "en" | "zh" }) {
  const s = useSpaceSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const me = s.members.find((m) => m.userId === s.userId);
  const name = me?.profile.displayName ?? s.profile?.displayName ?? s.email;
  const avatarChar = me?.profile.avatarChar ?? s.profile?.avatarChar ?? (name?.[0] ?? "·");
  const color = me?.profile.color ?? s.profile?.color ?? "#888888";
  const canViewUsage = s.isOwnerOfCurrent || s.currentRole === "admin";
  const cu = getCopy(locale);
  const roleLabel = s.isOwnerOfCurrent
    ? (locale === "zh" ? "所有者" : "Owner")
    : s.currentRole === "admin" ? (locale === "zh" ? "管理员" : "Admin") : (locale === "zh" ? "成员" : "Member");

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".account-menu")) setOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);

  async function logout() {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace(locale === "zh" ? "/zh/login" : "/login");
    router.refresh();
  }

  return (
    <div className="account-menu user-switcher">
      <button
        type="button"
        className="user-switcher-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <span className="uavatar" style={{ background: color }}>{avatarChar}</span>
        <span className="utext">
          <span className="uname">{name}</span>
          <span className="urole">{roleLabel}</span>
        </span>
        <span className="ucaret">▾</span>
      </button>
      {open ? (
        <div className="user-popover">
          <div className="user-popover-head">{locale === "zh" ? "账号" : "Account"}</div>
          {canViewUsage ? (
            <button
              type="button"
              className="user-row"
              onClick={() => router.push(locale === "zh" ? "/zh/usage" : "/usage")}
            >
              <span className="urowtxt">
                <span className="urowname">{cu.account.usageLink}</span>
              </span>
            </button>
          ) : null}
          <button type="button" className="user-row" onClick={logout}>
            <span className="urowtxt">
              <span className="urowname">{locale === "zh" ? "登出" : "Sign out"}</span>
              <span className="urowrole">{s.email}</span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
