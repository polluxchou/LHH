"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { getSignalCounts } from "@/components/workbench/selectors";
import { priorityClass } from "@/components/workbench/helpers";
import type { TrackingObjectType } from "@/lib/domain/types";

const TYPE_LABEL: Record<TrackingObjectType, string> = { company: "公司", facility: "设施", program: "项目", project: "项目" };
const TYPE_GLYPH: Record<TrackingObjectType, string> = { company: "🏢", facility: "🚀", program: "🛰", project: "🛰" };
const PRIO_LABEL = { high: "高", mid: "中", low: "低" } as const;

type SortKey = "signals" | "priority" | "update" | "name";

const SORTS: Array<[SortKey, string]> = [
  ["signals", "新信号数"],
  ["priority", "优先级"],
  ["update", "更新时间"],
  ["name", "名称"],
];

export function TrackedManageView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const router = useRouter();
  const home = locale === "zh" ? "/zh" : "/";
  const [sortBy, setSortBy] = useState<SortKey>("signals");

  const signalCounts = useMemo(() => getSignalCounts(state), [state]);
  const briefCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const brief of state.editorialBriefs) {
      counts[brief.trackingObjectId] = (counts[brief.trackingObjectId] ?? 0) + 1;
    }

    return counts;
  }, [state]);

  const mineCount = state.trackingObjects.filter((object) =>
    store.currentMember.trackingObjectIds.includes(object.id),
  ).length;

  const list = useMemo(() => {
    const visible =
      store.scope === "mine"
        ? state.trackingObjects.filter((object) => store.currentMember.trackingObjectIds.includes(object.id))
        : state.trackingObjects;

    return [...visible].sort((a, b) => {
      const aSignals = signalCounts[a.id] ?? 0;
      const bSignals = signalCounts[b.id] ?? 0;

      switch (sortBy) {
        case "priority":
          return a.priority - b.priority || bSignals - aSignals;
        case "name":
          return (a.nameZh ?? a.name).localeCompare(b.nameZh ?? b.name, "zh-Hans");
        case "update":
          return b.updatedAt.localeCompare(a.updatedAt);
        case "signals":
        default:
          return bSignals - aSignals;
      }
    });
  }, [state.trackingObjects, store.scope, store.currentMember, sortBy, signalCounts]);

  return (
    <div className="vv">
      <header className="vv-head">
        <div className="vv-head-left">
          <div className="vv-kicker">追踪对象 · TRACKED</div>
          <h2 className="vv-title">所有正在监测的航空航天对象</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action" onClick={() => store.setAddOpen(true)}>
            ＋ 新增对象
          </button>
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            返回工作台
          </button>
        </div>
      </header>

      <div className="vv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">视图</span>
          <div className="vv-pills">
            <button
              type="button"
              className={`vv-pill ${store.scope === "mine" ? "active" : ""}`}
              onClick={() => store.setScope("mine")}
            >
              我关注的 <span className="n">{mineCount}</span>
            </button>
            <button
              type="button"
              className={`vv-pill ${store.scope === "team" ? "active" : ""}`}
              onClick={() => store.setScope("team")}
            >
              团队全部 <span className="n">{state.trackingObjects.length}</span>
            </button>
          </div>
        </div>
        <div className="vv-tool">
          <span className="vv-tool-l">排序</span>
          <div className="vv-pills">
            {SORTS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`vv-pill ${sortBy === key ? "active" : ""}`}
                onClick={() => setSortBy(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="vv-body">
        <div className="vv-table tracked-table">
          <div className="vv-row vv-head-row">
            <span className="vc-name">对象</span>
            <span className="vc-type">类型</span>
            <span className="vc-track">赛道</span>
            <span className="vc-prio">优先</span>
            <span className="vc-hq">总部 / 地点</span>
            <span className="vc-update">最近更新</span>
            <span className="vc-stats">新信号 · 已生成简报</span>
            <span className="vc-subs">订阅者</span>
            <span className="vc-act">操作</span>
          </div>
          {list.map((object) => {
            const isSubscribed = store.currentMember.trackingObjectIds.includes(object.id);
            const subscribers = state.teamMembers.filter((member) => member.trackingObjectIds.includes(object.id));
            const prio = priorityClass(object.priority);
            const displayName = object.nameZh ?? object.name;

            return (
              <div key={object.id} className={`vv-row tracked-row prio-${prio}`}>
                <span className="vc-name">
                  <span className="vname-cn">{displayName}</span>
                  {object.name !== displayName ? <span className="vname-en">{object.name}</span> : null}
                </span>
                <span className="vc-type">
                  <span className="vtype-chip">
                    {TYPE_GLYPH[object.type]} {TYPE_LABEL[object.type]}
                  </span>
                </span>
                <span className="vc-track">{object.primaryTrack}</span>
                <span className="vc-prio">
                  <span className={`vprio prio-${prio}`}>● {PRIO_LABEL[prio]}</span>
                </span>
                <span className="vc-hq">{object.countryOrRegion}</span>
                <span className="vc-update">{object.updatedAt.slice(0, 10)}</span>
                <span className="vc-stats">
                  <span className="vsig">{signalCounts[object.id] ?? 0}</span>
                  <span className="vsig-sep">·</span>
                  <span className="vbrief">{briefCounts[object.id] ?? 0}</span>
                </span>
                <span className="vc-subs">
                  {subscribers.slice(0, 4).map((member) => (
                    <span key={member.id} className="vavatar" style={{ background: member.color }} title={member.name}>
                      {member.avatarChar}
                    </span>
                  ))}
                  {subscribers.length > 4 ? <span className="vavatar-more">+{subscribers.length - 4}</span> : null}
                </span>
                <span className="vc-act">
                  <button
                    type="button"
                    className="vbtn"
                    onClick={() => {
                      store.pickTracked(object.id);
                      router.push(home);
                    }}
                  >
                    查看
                  </button>
                  <button
                    type="button"
                    className={`vbtn ${isSubscribed ? "subbed" : "subscribe"}`}
                    onClick={() => store.subToggle(object.id)}
                  >
                    {isSubscribed ? "✓ 已订" : "+ 订阅"}
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
