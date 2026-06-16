"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import type { Launch, LaunchOrg, LaunchStatus } from "@/lib/domain/types";
import { LAUNCH_SIM_TODAY, launchOrgs, launches } from "@/lib/data/launches";
import { EXPO_SIM_TODAY, expoOrgs, fastenerExpos, usesExpoSchedule } from "@/lib/data/fastener-expos";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { useSpaceSession } from "@/components/account/space-provider";
import { useCopy } from "@/lib/i18n/locale-context";

type RangeKey = "today" | "week" | "month" | "all";

/** 一个"日程模块"的数据（文案走字典 t.views.launches[kind]）；按空间切换（航天发射 / 紧固件展会）。 */
interface ScheduleConfig {
  kind: "launch" | "expo";
  simToday: string;
  items: Launch[];
  orgs: Record<string, LaunchOrg>;
  emptyGlyph: string;
  watchIcon: string;
}

const LAUNCH_SCHEDULE: ScheduleConfig = {
  kind: "launch",
  simToday: LAUNCH_SIM_TODAY,
  items: launches,
  orgs: launchOrgs,
  emptyGlyph: "🚀",
  watchIcon: "▶",
};

const EXPO_SCHEDULE: ScheduleConfig = {
  kind: "expo",
  simToday: EXPO_SIM_TODAY,
  items: fastenerExpos,
  orgs: expoOrgs,
  emptyGlyph: "🔩",
  watchIcon: "🔗",
};

// 发射机构官网（真实域名）—— 发射卡的 watch 是直播渠道标签（非网址），链到机构官网作为可达入口。
const LAUNCH_ORG_SITE: Record<string, string> = {
  spacex: "https://www.spacex.com/launches/",
  cnsa: "https://www.cctv.com/",
  rocketlab: "https://www.rocketlabusa.com/",
  roscosmos: "https://www.roscosmos.ru/",
  isro: "https://www.isro.gov.in/",
  arianespace: "https://www.arianespace.com/",
  jaxa: "https://global.jaxa.jp/",
  stoke: "https://www.stokespace.com/",
  lanjian: "https://www.landspace.com/",
  isar: "https://www.isaraerospace.com/",
  ula: "https://www.ulalaunch.com/",
};

/** 展会 watch 是裸域名 → https 链接；发射 watch 是渠道标签 → 链到机构官网。无则不可点。 */
function watchHrefFor(item: Launch, kind: ScheduleConfig["kind"]): string | undefined {
  if (kind === "expo") {
    return item.watch ? `https://${item.watch.replace(/^https?:\/\//, "")}` : undefined;
  }
  return LAUNCH_ORG_SITE[item.orgId];
}

export function LaunchScheduleView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { mySpaces, currentSpaceId } = useSpaceSession();
  const router = useRouter();
  const t = useCopy();
  const L = t.views.launches;
  const home = locale === "zh" ? "/zh" : "/";

  const spaceName = mySpaces.find((s) => s.space.id === currentSpaceId)?.space.name;
  const config = usesExpoSchedule(spaceName) ? EXPO_SCHEDULE : LAUNCH_SCHEDULE;
  const ct = config.kind === "expo" ? L.expo : L.launch;
  const RANGE_OPTIONS: Array<[RangeKey, string]> = [
    ["today", L.range.today],
    ["week", L.range.week],
    ["month", L.range.month],
    ["all", L.range.all],
  ];
  const WEEKDAYS = L.weekdays;

  // 展会按全年分布、稀疏，默认看「全部」（也让 1–5 月已过的展会出现）；发射保持「未来 7 天」。
  const [range, setRange] = useState<RangeKey>(config.kind === "expo" ? "all" : "week");
  const [orgFilter, setOrgFilter] = useState<ReadonlySet<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<LaunchStatus | "all">("all");

  // "今天"取真实本机日期（按展示时区上海）；首屏先用写死的 simToday 以避免 SSR hydration 不一致，
  // 挂载后用 useEffect 切到真实日期。
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    setToday(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date()));
  }, []);
  const refToday = today ?? config.simToday;

  const dayDiff = (date: string) =>
    Math.round((new Date(date).getTime() - new Date(refToday).getTime()) / 86_400_000);

  const dayLabel = (date: string): string => {
    const diff = dayDiff(date);
    if (diff === 0) return L.relToday;
    if (diff === 1) return L.relTomorrow;
    if (diff === 2) return L.relDayAfter;
    if (diff < 0) return L.relAgo(-diff);
    return L.relIn(diff);
  };

  const statusOptions: Array<[LaunchStatus | "all", string]> = [
    ["all", t.views.filterAll],
    ["confirmed", ct.status.confirmed],
    ["window", ct.status.window],
    ["tentative", ct.status.tentative],
  ];

  const orgCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of config.items) counts[item.orgId] = (counts[item.orgId] ?? 0) + 1;
    return counts;
  }, [config]);

  const filtered = useMemo(() => {
    return config.items
      .filter((item) => {
        const diff = dayDiff(item.date);
        if (range === "today" && diff !== 0) return false;
        if (range === "week" && (diff < 0 || diff > 7)) return false;
        if (range === "month" && (diff < 0 || diff > 30)) return false;
        if (orgFilter.size > 0 && !orgFilter.has(item.orgId)) return false;
        if (statusFilter !== "all" && item.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (a.date + a.timeUTC).localeCompare(b.date + b.timeUTC));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, range, orgFilter, statusFilter, refToday]);

  const byDate = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const list = groups.get(item.date) ?? [];
      list.push(item);
      groups.set(item.date, list);
    }
    return [...groups.entries()];
  }, [filtered]);

  const toggleOrg = (orgId: string) => {
    setOrgFilter((previous) => {
      const next = new Set(previous);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return next;
    });
  };

  const jumpToTracked = (trackingObjectId: string) => {
    store.pickTracked(trackingObjectId);
    router.push(home);
  };

  return (
    <div className="vv lv">
      <header className="vv-head">
        <div className="vv-head-left">
          <div className="vv-kicker">{ct.kicker}</div>
          <h2 className="vv-title">{ct.title}</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            {t.views.backToWorkbench}
          </button>
        </div>
      </header>

      <div className="vv-toolbar lv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">{L.toolRange}</span>
          <div className="vv-pills">
            {RANGE_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`vv-pill ${range === key ? "active" : ""}`}
                onClick={() => setRange(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="vv-tool">
          <span className="vv-tool-l">{t.views.toolStatus}</span>
          <div className="vv-pills">
            {statusOptions.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`vv-pill ${statusFilter === key ? "active" : ""}`}
                onClick={() => setStatusFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="vv-tool flex-1">
          <span className="vv-tool-l">{ct.orgGroupLabel}</span>
          <div className="lv-org-chips">
            {Object.entries(config.orgs).map(([orgId, org]) => {
              const on = orgFilter.size === 0 || orgFilter.has(orgId);

              return (
                <button
                  key={orgId}
                  type="button"
                  className={`lv-org-chip ${on ? "on" : "off"}`}
                  style={{ "--cc": org.color } as CSSProperties}
                  onClick={() => toggleOrg(orgId)}
                >
                  <span className="dot" />
                  <span className="lv-org-flag">{org.flag}</span>
                  <span>{org.name}</span>
                  <span className="lv-org-n">{orgCounts[orgId] ?? 0}</span>
                </button>
              );
            })}
            {orgFilter.size > 0 ? (
              <button type="button" className="lv-org-reset" onClick={() => setOrgFilter(new Set())}>
                {L.clearFilter}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="vv-body lv-body">
        {byDate.length === 0 ? (
          <div className="vv-empty">
            <div className="vv-empty-glyph">{config.emptyGlyph}</div>
            <div className="vv-empty-title">{ct.emptyTitle}</div>
            <div className="vv-empty-sub">{ct.emptySub}</div>
          </div>
        ) : (
          <div className="lv-timeline">
            {byDate.map(([date, items]) => {
              const isToday = dayDiff(date) === 0;

              return (
                <section key={date} className={`lv-day ${isToday ? "is-today" : ""}`}>
                  <header className="lv-day-head">
                    <div className="lv-day-marker">
                      <span className="lv-day-d">{date.slice(8)}</span>
                      <span className="lv-day-m">{L.monthLabel(date.slice(5, 7))}</span>
                    </div>
                    <div className="lv-day-meta">
                      <span className="lv-day-rel">{dayLabel(date)}</span>
                      <span className="lv-day-wd">
                        · {WEEKDAYS[new Date(date).getDay()]} · {date}
                      </span>
                    </div>
                    <span className="lv-day-n">
                      {items.length} {ct.countSuffix}
                    </span>
                  </header>
                  <div className="lv-launches">
                    {items.map((launch) => {
                      const org = config.orgs[launch.orgId];
                      const tracked = launch.trackingObjectId
                        ? store.state.trackingObjects.find((object) => object.id === launch.trackingObjectId)
                        : undefined;
                      const isMine = Boolean(
                        launch.trackingObjectId &&
                          store.currentMember.trackingObjectIds.includes(launch.trackingObjectId),
                      );

                      return (
                        <article
                          key={launch.id}
                          className={`lv-launch status-${launch.status} ${isMine ? "mine" : ""}`}
                          style={{ "--cc": org.color } as CSSProperties}
                        >
                          <div className="lv-time">
                            {config.kind === "expo" ? (
                              <>
                                <span className="lv-time-utc">{launch.window}</span>
                                <span className="lv-time-z">{L.expoWindow}</span>
                              </>
                            ) : (
                              <>
                                <span className="lv-time-utc">{launch.timeUTC}</span>
                                <span className="lv-time-z">{L.utc}</span>
                              </>
                            )}
                          </div>
                          <div className="lv-org-stripe" />
                          <div className="lv-main">
                            <div className="lv-mission-row">
                              <span className="lv-mission">{launch.mission}</span>
                              <span className={`lv-status s-${launch.status}`}>
                                {ct.status[launch.status]}
                              </span>
                              {isMine && tracked && launch.trackingObjectId ? (
                                <button
                                  type="button"
                                  className="lv-tracked-tag"
                                  title={L.trackedTagTitle(tracked.nameZh ?? tracked.name)}
                                  onClick={() => jumpToTracked(launch.trackingObjectId!)}
                                >
                                  ★ {tracked.nameZh ?? tracked.name}
                                </button>
                              ) : null}
                            </div>
                            <div className="lv-vehicle-row">
                              {launch.vehicle ? (
                                <>
                                  <span className="lv-vehicle">{launch.vehicle}</span>
                                  <span className="lv-sep">·</span>
                                </>
                              ) : null}
                              <span className="lv-org">
                                <span className="lv-org-flag-small">{org.flag}</span> {org.name}
                              </span>
                              <span className="lv-sep">·</span>
                              <span className="lv-pad">
                                {launch.pad} · {launch.site}
                              </span>
                            </div>
                            <div className="lv-payload-row">
                              <span className="lv-orbit">{launch.orbit}</span>
                              <span className="lv-sep">·</span>
                              <span className="lv-payload">{launch.payload}</span>
                              {config.kind === "expo" ? null : (
                                <>
                                  <span className="lv-sep">·</span>
                                  <span className="lv-window">
                                    {ct.windowLabel} {launch.window}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="lv-side">
                            {(() => {
                              const href = watchHrefFor(launch, config.kind);
                              return href ? (
                                <a className="lv-watch" href={href} target="_blank" rel="noreferrer">
                                  {config.watchIcon} {launch.watch}
                                </a>
                              ) : (
                                <span className="lv-watch">
                                  {config.watchIcon} {launch.watch}
                                </span>
                              );
                            })()}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
