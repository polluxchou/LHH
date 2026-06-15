"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSpaceSession } from "@/components/account/space-provider";

export function SpaceSwitcher({ locale }: { locale: "en" | "zh" }) {
  const s = useSpaceSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = s.mySpaces.find((m) => m.space.id === s.currentSpaceId);
  const ownsApp = s.mySpaces.some((m) => m.isOwner);
  const canManage = s.isOwnerOfCurrent || s.currentRole === "admin";
  const t = locale === "zh"
    ? { label: "当前空间", head: "切换空间", neww: "＋ 新建空间", all: "全部空间", members: "成员管理" }
    : { label: "Current space", head: "Switch space", neww: "+ New space", all: "All spaces", members: "Members" };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest(".space-switcher")) setOpen(false);
    };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [open]);

  return (
    <div className="space-switcher user-switcher">
      <button
        type="button"
        className="user-switcher-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        <span className="utext">
          <span className="urole">{t.label}</span>
          <span className="uname">{current?.space.name ?? "—"}</span>
        </span>
        <span className="ucaret">▾</span>
      </button>
      {open ? (
        <div className="user-popover">
          <div className="user-popover-head">{t.head}</div>
          {s.mySpaces.map((m) => (
            <button
              key={m.space.id}
              type="button"
              className={`user-row ${m.space.id === s.currentSpaceId ? "active" : ""}`}
              onClick={() => { s.setCurrentSpaceId(m.space.id); setOpen(false); }}
            >
              <span className="urowtxt">
                <span className="urowname">{m.space.name}</span>
                <span className="urowrole">{m.space.theme || (m.role === "admin" ? "管理员" : "成员")}</span>
              </span>
              {m.space.id === s.currentSpaceId ? <span className="urowmark">●</span> : null}
            </button>
          ))}
          {canManage && s.currentSpaceId ? (
            <button
              type="button"
              className="user-row"
              onClick={() => { router.push(`${locale === "zh" ? "/zh" : ""}/space/members?space=${s.currentSpaceId}`); setOpen(false); }}
            >
              <span className="urowtxt"><span className="urowname">{t.members}</span></span>
            </button>
          ) : null}
          {ownsApp ? (
            <>
              <button
                type="button"
                className="user-row"
                onClick={() => { router.push(locale === "zh" ? "/zh/spaces" : "/spaces"); setOpen(false); }}
              >
                <span className="urowtxt"><span className="urowname">{t.all}</span></span>
              </button>
              <button
                type="button"
                className="user-row"
                onClick={() => { router.push(locale === "zh" ? "/zh/spaces?new=1" : "/spaces?new=1"); setOpen(false); }}
              >
                <span className="urowtxt"><span className="urowname">{t.neww}</span></span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
