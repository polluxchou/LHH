"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n/copy";
import { getWorkbenchChrome } from "@/lib/i18n/workbench-copy";
import { buildViewSwitcherItems, type ViewSwitcherId } from "@/lib/navigation/view-switcher";
import { SpaceSwitcher } from "@/components/account/space-switcher";
import { AccountMenu } from "@/components/account/account-menu";

export type NavTabId = ViewSwitcherId;

interface TopNavProps {
  locale: Locale;
  /** highlighted tab; derived from the pathname when omitted */
  active?: NavTabId;
  badges?: { brief?: number; pool?: number; launch?: number };
}

function deriveTabFromPathname(pathname: string | null): NavTabId {
  if (!pathname) return "home";
  if (pathname.includes("/tracking-objects")) return "tracked";
  if (pathname.includes("/briefs")) return "brief";
  if (pathname.includes("/topic-pool")) return "pool";
  if (pathname.includes("/map")) return "map";
  if (pathname.includes("/launches")) return "schedule";
  return "home";
}

export function TopNav({ locale, active, badges }: TopNavProps) {
  const chrome = getWorkbenchChrome(locale);
  const prefix = locale === "zh" ? "/zh" : "";
  const pathname = usePathname();
  const activeTab = active ?? deriveTabFromPathname(pathname);
  const [viewOpen, setViewOpen] = useState(false);
  // 顶部日期角标跟随真实本地日期（上海时区）；首屏先用文案默认值以避免 hydration 不一致。
  const [today, setToday] = useState<{ day: string; month: string } | null>(null);

  useEffect(() => {
    const now = new Date();
    const numeric = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      day: "numeric",
      month: "numeric",
    }).formatToParts(now);
    const day = numeric.find((part) => part.type === "day")?.value ?? "";
    const monthNum = numeric.find((part) => part.type === "month")?.value ?? "";
    const month =
      locale === "zh"
        ? `${monthNum}月`
        : new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", month: "short" })
            .format(now)
            .toUpperCase();

    setToday({ day, month });
  }, [locale]);

  useEffect(() => {
    if (!viewOpen) {
      return;
    }

    const onDocumentClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".view-launcher")) {
        setViewOpen(false);
      }
    };
    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setViewOpen(false);
      }
    };

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeyDown);
    return () => {
      document.removeEventListener("click", onDocumentClick);
      document.removeEventListener("keydown", onDocumentKeyDown);
    };
  }, [viewOpen]);

  const viewItems = buildViewSwitcherItems({ chrome, prefix, badges, locale });
  const activeView = viewItems.find((item) => item.id === activeTab) ?? viewItems[0];
  const viewCopy =
    locale === "zh"
      ? {
          current: "当前视图",
          switch: "切换视图",
          close: "Esc 关闭",
          foot: `共 ${viewItems.length} 个视图 · 工作台为默认入口`,
        }
      : {
          current: "Current View",
          switch: "Switch View",
          close: "Esc close",
          foot: `${viewItems.length} views · Workbench is the default`,
        };

  return (
    <header className="topnav">
      <div className="brand">
        <span className="brand-mark">Signals</span>
        <span className="brand-sub">{chrome.brandSub}</span>
      </div>
      <div className="brand-divider"></div>
      <SpaceSwitcher locale={locale} />
      <div className="brand-divider"></div>
      <div className="view-launcher">
        <button
          type="button"
          className={`vl-trigger ${viewOpen ? "open" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={viewOpen}
          onClick={(event) => {
            event.stopPropagation();
            setViewOpen((value) => !value);
          }}
        >
          <span className="vl-trigger-icon">⊞</span>
          <span className="vl-trigger-current">
            <span className="vl-trigger-l">{viewCopy.current}</span>
            <span className="vl-trigger-n">{activeView.label}</span>
          </span>
          <span className="vl-trigger-caret">▾</span>
        </button>
        {viewOpen ? (
          <div className="vl-popover" role="dialog" aria-label={viewCopy.switch}>
            <div className="vl-popover-head">
              <span>{viewCopy.switch}</span>
              <span className="vl-popover-hint">{viewCopy.close}</span>
            </div>
            <div className="vl-grid">
              {viewItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.href ?? prefix ?? "/"}
                  className={`vl-card ${activeTab === item.id ? "active" : ""}`}
                  onClick={() => setViewOpen(false)}
                >
                  <span className="vl-card-glyph">{item.icon}</span>
                  <span className="vl-card-body">
                    <span className="vl-card-name">
                      {item.label}
                      {item.badge ? <span className="vl-card-badge">{item.badge}</span> : null}
                    </span>
                    <span className="vl-card-desc">{item.description}</span>
                  </span>
                  {activeTab === item.id ? <span className="vl-card-mark">●</span> : null}
                </Link>
              ))}
            </div>
            <div className="vl-popover-foot">{viewCopy.foot}</div>
          </div>
        ) : null}
      </div>
      <div className="nav-spacer"></div>
      <div className="nav-meta">
        <span>
          <span className="pulse"></span>
          {chrome.pipelineOnline}
        </span>
        <span
          className="date-chip"
          title={`${today?.month ?? chrome.date.month} ${today?.day ?? chrome.date.day}`}
          aria-label={`${today?.month ?? chrome.date.month} ${today?.day ?? chrome.date.day}`}
        >
          <span className="date-chip-day">{today?.day ?? chrome.date.day}</span>
          <span className="date-chip-month">{today?.month ?? chrome.date.month}</span>
        </span>
      </div>
      <div className="lang-switch">
        <Link href="/zh" className={locale === "zh" ? "active" : ""}>
          中
        </Link>
        <Link href="/" className={locale === "en" ? "active" : ""}>
          EN
        </Link>
      </div>
      <AccountMenu locale={locale} />
    </header>
  );
}
