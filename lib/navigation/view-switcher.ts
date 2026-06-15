import type { Locale } from "@/lib/i18n/copy";
import type { WorkbenchChrome } from "@/lib/i18n/workbench-copy";
import { usesExpoSchedule } from "@/lib/data/fastener-expos";

export type ViewSwitcherId = "home" | "tracked" | "brief" | "pool" | "map" | "schedule";

export interface ViewSwitcherItem {
  id: ViewSwitcherId;
  label: string;
  description: string;
  icon: string;
  href?: string;
  badge?: number;
  disabled?: boolean;
}

const DESCRIPTIONS: Record<Locale, Record<ViewSwitcherId, string>> = {
  zh: {
    home: "搜索 · 信号 · 简报 · 一站式审稿",
    tracked: "所有正在监测的航空航天对象",
    brief: "跨对象 inbox · 等待筛选的线索",
    pool: "已通过 · 团队共享的内容选题",
    map: "事件发生地 · 按天追踪",
    schedule: "全球火箭发射窗口 · 未来 30 天",
  },
  en: {
    home: "Search, signals, briefs, and review",
    tracked: "All aerospace objects under monitoring",
    brief: "Cross-object inbox for screening",
    pool: "Approved shared editorial topics",
    map: "Event locations tracked by day",
    schedule: "Global launch windows, next 30 days",
  },
};

const LABELS: Record<Locale, Partial<Record<ViewSwitcherId, string>>> = {
  zh: { schedule: "发射日程" },
  en: { schedule: "Launch Schedule" },
};

/** "schedule" 这一项在"紧固件展会"类空间下的标签/描述/图标覆盖。 */
const EXPO_SCHEDULE_NAV: Record<Locale, { label: string; description: string }> = {
  zh: { label: "行业展会", description: "全球紧固件展会 · 未来 30 天" },
  en: { label: "Industry Expos", description: "Global fastener trade shows, next 30 days" },
};
const EXPO_SCHEDULE_ICON = "🔩";

const ICONS: Record<ViewSwitcherId, string> = {
  home: "▦",
  tracked: "◎",
  brief: "✎",
  pool: "◇",
  map: "◐",
  schedule: "↑",
};

export function buildViewSwitcherItems({
  chrome,
  prefix,
  badges,
  locale,
  spaceName,
}: {
  chrome: WorkbenchChrome;
  prefix: string;
  badges?: { brief?: number; pool?: number; launch?: number };
  locale: Locale;
  /** current space name — relabels the "schedule" view per space (e.g. 行业展会 for fastener spaces) */
  spaceName?: string | null;
}): ViewSwitcherItem[] {
  const homeHref = prefix || "/";
  const expoSchedule = usesExpoSchedule(spaceName);

  return [
    {
      id: "home",
      label: chrome.navHome,
      description: DESCRIPTIONS[locale].home,
      icon: ICONS.home,
      href: homeHref,
    },
    {
      id: "tracked",
      label: chrome.navTracking,
      description: DESCRIPTIONS[locale].tracked,
      icon: ICONS.tracked,
      href: `${prefix}/tracking-objects`,
    },
    {
      id: "brief",
      label: chrome.navBriefs,
      description: DESCRIPTIONS[locale].brief,
      icon: ICONS.brief,
      href: `${prefix}/briefs`,
      badge: badges?.brief,
    },
    {
      id: "pool",
      label: chrome.navTopicPool,
      description: DESCRIPTIONS[locale].pool,
      icon: ICONS.pool,
      href: `${prefix}/topic-pool`,
      badge: badges?.pool,
    },
    {
      id: "map",
      label: chrome.navMap,
      description: DESCRIPTIONS[locale].map,
      icon: ICONS.map,
      href: `${prefix}/map`,
    },
    {
      id: "schedule",
      label: expoSchedule ? EXPO_SCHEDULE_NAV[locale].label : (LABELS[locale].schedule ?? "Schedule"),
      description: expoSchedule ? EXPO_SCHEDULE_NAV[locale].description : DESCRIPTIONS[locale].schedule,
      icon: expoSchedule ? EXPO_SCHEDULE_ICON : ICONS.schedule,
      href: `${prefix}/launches`,
      badge: expoSchedule ? undefined : badges?.launch,
    },
  ];
}
