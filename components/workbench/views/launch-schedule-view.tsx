"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import type { LaunchStatus } from "@/lib/domain/types";
import { launchDayDiff, launchOrgs, launches } from "@/lib/data/launches";
import { useWorkflow } from "@/components/workbench/workflow-provider";

type RangeKey = "today" | "week" | "month" | "all";

const RANGE_OPTIONS: Array<[RangeKey, string]> = [
  ["today", "今天"],
  ["week", "未来 7 天"],
  ["month", "未来 30 天"],
  ["all", "全部"],
];

const STATUS_OPTIONS: Array<[LaunchStatus | "all", string]> = [
  ["all", "全部"],
  ["confirmed", "确认"],
  ["window", "窗口"],
  ["tentative", "待定"],
];

const STATUS_LABELS: Record<LaunchStatus, string> = {
  confirmed: "确认",
  window: "窗口",
  tentative: "待定",
  standby: "待命",
};

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function dayLabel(date: string): string {
  const diff = launchDayDiff(date);

  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff < 0) return `${-diff} 天前`;
  return `+${diff} 天`;
}

export function LaunchScheduleView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const router = useRouter();
  const home = locale === "zh" ? "/zh" : "/";
  const [range, setRange] = useState<RangeKey>("week");
  const [orgFilter, setOrgFilter] = useState<ReadonlySet<string>>(() => new Set());
  const [statusFilter, setStatusFilter] = useState<LaunchStatus | "all">("all");

  const orgCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const launch of launches) {
      counts[launch.orgId] = (counts[launch.orgId] ?? 0) + 1;
    }

    return counts;
  }, []);

  const filtered = useMemo(() => {
    return launches
      .filter((launch) => {
        const diff = launchDayDiff(launch.date);

        if (range === "today" && diff !== 0) return false;
        if (range === "week" && (diff < 0 || diff > 7)) return false;
        if (range === "month" && (diff < 0 || diff > 30)) return false;
        if (orgFilter.size > 0 && !orgFilter.has(launch.orgId)) return false;
        if (statusFilter !== "all" && launch.status !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => (a.date + a.timeUTC).localeCompare(b.date + b.timeUTC));
  }, [range, orgFilter, statusFilter]);

  const byDate = useMemo(() => {
    const groups = new Map<string, typeof filtered>();

    for (const launch of filtered) {
      const list = groups.get(launch.date) ?? [];

      list.push(launch);
      groups.set(launch.date, list);
    }

    return [...groups.entries()];
  }, [filtered]);

  const toggleOrg = (orgId: string) => {
    setOrgFilter((previous) => {
      const next = new Set(previous);

      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }

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
          <div className="vv-kicker">发射窗口期 · LAUNCH SCHEDULE</div>
          <h2 className="vv-title">全球火箭发射日程 · 未来 30 天</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            返回工作台
          </button>
        </div>
      </header>

      <div className="vv-toolbar lv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">时间范围</span>
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
          <span className="vv-tool-l">状态</span>
          <div className="vv-pills">
            {STATUS_OPTIONS.map(([key, label]) => (
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
          <span className="vv-tool-l">发射机构</span>
          <div className="lv-org-chips">
            {Object.entries(launchOrgs).map(([orgId, org]) => {
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
                清除筛选
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="vv-body lv-body">
        {byDate.length === 0 ? (
          <div className="vv-empty">
            <div className="vv-empty-glyph">🚀</div>
            <div className="vv-empty-title">所选范围内没有发射任务</div>
            <div className="vv-empty-sub">尝试放宽时间范围或调整机构筛选。</div>
          </div>
        ) : (
          <div className="lv-timeline">
            {byDate.map(([date, items]) => {
              const isToday = launchDayDiff(date) === 0;

              return (
                <section key={date} className={`lv-day ${isToday ? "is-today" : ""}`}>
                  <header className="lv-day-head">
                    <div className="lv-day-marker">
                      <span className="lv-day-d">{date.slice(8)}</span>
                      <span className="lv-day-m">{date.slice(5, 7)}月</span>
                    </div>
                    <div className="lv-day-meta">
                      <span className="lv-day-rel">{dayLabel(date)}</span>
                      <span className="lv-day-wd">
                        · {WEEKDAYS[new Date(date).getDay()]} · {date}
                      </span>
                    </div>
                    <span className="lv-day-n">{items.length} 次发射</span>
                  </header>
                  <div className="lv-launches">
                    {items.map((launch) => {
                      const org = launchOrgs[launch.orgId];
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
                            <span className="lv-time-utc">{launch.timeUTC}</span>
                            <span className="lv-time-z">UTC</span>
                          </div>
                          <div className="lv-org-stripe" />
                          <div className="lv-main">
                            <div className="lv-mission-row">
                              <span className="lv-mission">{launch.mission}</span>
                              <span className={`lv-status s-${launch.status}`}>{STATUS_LABELS[launch.status]}</span>
                              {isMine && tracked && launch.trackingObjectId ? (
                                <button
                                  type="button"
                                  className="lv-tracked-tag"
                                  title={`你关注的对象 · ${tracked.nameZh ?? tracked.name}`}
                                  onClick={() => jumpToTracked(launch.trackingObjectId!)}
                                >
                                  ★ {tracked.nameZh ?? tracked.name}
                                </button>
                              ) : null}
                            </div>
                            <div className="lv-vehicle-row">
                              <span className="lv-vehicle">{launch.vehicle}</span>
                              <span className="lv-sep">·</span>
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
                              <span className="lv-sep">·</span>
                              <span className="lv-window">窗口 {launch.window}</span>
                            </div>
                          </div>
                          <div className="lv-side">
                            <button type="button" className="lv-watch">
                              ▶ {launch.watch}
                            </button>
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
