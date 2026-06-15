"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { buildBriefViewModel } from "@/components/workbench/selectors";
import { KIND_LABELS, type BriefUiStatus } from "@/components/workbench/helpers";

const STATUS_INBOX_LABEL: Record<BriefUiStatus, string> = {
  pending: "待筛",
  pool: "已通过",
  watch: "观察",
  rejected: "已拒绝",
};

type InboxFilter = "all" | BriefUiStatus;
type SortKey = "date" | "score";

const STATUS_FILTERS: Array<[InboxFilter, string]> = [
  ["all", "全部"],
  ["pending", "待筛"],
  ["pool", "已通过"],
  ["watch", "观察"],
  ["rejected", "已拒"],
];

export function BriefingsInboxView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const router = useRouter();
  const home = locale === "zh" ? "/zh" : "/";
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [trackedFilter, setTrackedFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("date");

  const trackedSet = useMemo(
    () =>
      store.scope === "mine"
        ? new Set(store.currentMember.trackingObjectIds)
        : new Set(state.trackingObjects.map((object) => object.id)),
    [store.scope, store.currentMember, state.trackingObjects],
  );

  const visibleVMs = useMemo(
    () =>
      state.editorialBriefs
        .filter((brief) => trackedSet.has(brief.trackingObjectId))
        .map((brief) => buildBriefViewModel(state, brief)),
    [state, trackedSet],
  );

  const counts = useMemo(
    () => ({
      all: visibleVMs.length,
      pending: visibleVMs.filter((item) => item.uiStatus === "pending").length,
      pool: visibleVMs.filter((item) => item.uiStatus === "pool").length,
      watch: visibleVMs.filter((item) => item.uiStatus === "watch").length,
      rejected: visibleVMs.filter((item) => item.uiStatus === "rejected").length,
    }),
    [visibleVMs],
  );

  const trackedOptions = useMemo(() => {
    const ids = [...new Set(visibleVMs.map((item) => item.brief.trackingObjectId))];

    return ids
      .map((id) => state.trackingObjects.find((object) => object.id === id))
      .filter((object): object is NonNullable<typeof object> => Boolean(object));
  }, [visibleVMs, state.trackingObjects]);

  const list = useMemo(() => {
    let items = visibleVMs;

    if (filter !== "all") {
      items = items.filter((item) => item.uiStatus === filter);
    }

    if (trackedFilter !== "all") {
      items = items.filter((item) => item.brief.trackingObjectId === trackedFilter);
    }

    return [...items].sort((a, b) => {
      if (sortBy === "score") {
        return b.score - a.score;
      }

      return b.brief.createdAt.localeCompare(a.brief.createdAt);
    });
  }, [visibleVMs, filter, trackedFilter, sortBy]);

  const jumpToBrief = (briefId: string) => {
    store.focusBrief(briefId, "sources");
    router.push(home);
  };

  return (
    <div className="vv">
      <header className="vv-head">
        <div className="vv-head-left">
          <div className="vv-kicker">编辑简报 · BRIEFINGS INBOX</div>
          <h2 className="vv-title">所有正在等待判断的内容线索</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            返回工作台
          </button>
        </div>
      </header>

      <div className="vv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">状态</span>
          <div className="vv-pills">
            {STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`vv-pill ${filter === key ? "active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label} <span className="n">{counts[key === "all" ? "all" : key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="vv-tool">
          <span className="vv-tool-l">追踪对象</span>
          <select className="vv-select" value={trackedFilter} onChange={(event) => setTrackedFilter(event.target.value)}>
            <option value="all">全部</option>
            {trackedOptions.map((object) => (
              <option key={object.id} value={object.id}>
                {object.nameZh ?? object.name}
              </option>
            ))}
          </select>
        </div>
        <div className="vv-tool">
          <span className="vv-tool-l">排序</span>
          <div className="vv-pills">
            {(
              [
                ["date", "时间"],
                ["score", "价值分"],
              ] as Array<[SortKey, string]>
            ).map(([key, label]) => (
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
        {list.length === 0 ? (
          <div className="vv-empty">
            <div className="vv-empty-glyph">📑</div>
            <div className="vv-empty-title">没有匹配的简报</div>
            <div className="vv-empty-sub">尝试切换筛选条件，或返回工作台运行新一轮搜索。</div>
          </div>
        ) : (
          <div className="vv-table inbox-table">
            <div className="vv-row vv-head-row">
              <span className="ic-score">价值</span>
              <span className="ic-title">标题</span>
              <span className="ic-tracked">追踪对象</span>
              <span className="ic-kind">类型</span>
              <span className="ic-status">状态</span>
              <span className="ic-date">创建时间</span>
              <span className="ic-act">操作</span>
            </div>
            {list.map((item) => {
              const object = state.trackingObjects.find((entry) => entry.id === item.brief.trackingObjectId);

              return (
                <div key={item.brief.id} className={`vv-row inbox-row status-${item.uiStatus}`}>
                  <span className="ic-score">
                    <span className={`vsbox ${item.score >= 85 ? "high" : ""}`}>{item.score}</span>
                  </span>
                  <span className="ic-title">
                    <button type="button" className="vt-headline" onClick={() => jumpToBrief(item.brief.id)}>
                      {item.brief.briefTitle}
                    </button>
                    {item.brief.tagline ? <span className="vt-tagline">{item.brief.tagline}</span> : null}
                  </span>
                  <span className="ic-tracked">{object ? (object.nameZh ?? object.name) : "—"}</span>
                  <span className="ic-kind">
                    <span className={`vk-chip kind-${item.kind}`}>{KIND_LABELS[item.kind]}</span>
                  </span>
                  <span className="ic-status">
                    <span className={`vstat s-${item.uiStatus}`}>{STATUS_INBOX_LABEL[item.uiStatus]}</span>
                  </span>
                  <span className="ic-date">{item.brief.createdAt.slice(0, 10)}</span>
                  <span className="ic-act">
                    {item.uiStatus === "pending" ? (
                      <>
                        <button type="button" className="vbtn xs" onClick={() => store.decide(item.brief.id, "rejected")}>
                          拒
                        </button>
                        <button type="button" className="vbtn xs" onClick={() => store.decide(item.brief.id, "watch")}>
                          观
                        </button>
                        <button type="button" className="vbtn xs primary" onClick={() => store.decide(item.brief.id, "pool")}>
                          通过
                        </button>
                      </>
                    ) : (
                      <button type="button" className="vbtn xs" onClick={() => jumpToBrief(item.brief.id)}>
                        查看
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
