"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { buildBriefViewModel } from "@/components/workbench/selectors";
import { type BriefUiStatus } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

type InboxFilter = "all" | BriefUiStatus;
type SortKey = "date" | "score";

export function BriefingsInboxView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const router = useRouter();
  const t = useCopy();
  const home = locale === "zh" ? "/zh" : "/";
  const STATUS_INBOX_LABEL: Record<BriefUiStatus, string> = t.views.briefs.inboxStatus;
  const STATUS_FILTERS: Array<[InboxFilter, string]> = [
    ["all", t.views.briefs.filter.all],
    ["pending", t.views.briefs.filter.pending],
    ["pool", t.views.briefs.filter.pool],
    ["watch", t.views.briefs.filter.watch],
    ["rejected", t.views.briefs.filter.rejected],
  ];
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
          <div className="vv-kicker">{t.views.briefs.kicker}</div>
          <h2 className="vv-title">{t.views.briefs.title}</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            {t.views.backToWorkbench}
          </button>
        </div>
      </header>

      <div className="vv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">{t.views.toolStatus}</span>
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
          <span className="vv-tool-l">{t.views.briefs.trackedLabel}</span>
          <select className="vv-select" value={trackedFilter} onChange={(event) => setTrackedFilter(event.target.value)}>
            <option value="all">{t.views.filterAll}</option>
            {trackedOptions.map((object) => (
              <option key={object.id} value={object.id}>
                {object.nameZh ?? object.name}
              </option>
            ))}
          </select>
        </div>
        <div className="vv-tool">
          <span className="vv-tool-l">{t.views.toolSort}</span>
          <div className="vv-pills">
            {(
              [
                ["date", t.views.briefs.sortDate],
                ["score", t.views.briefs.sortScore],
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
            <div className="vv-empty-title">{t.views.briefs.emptyTitle}</div>
            <div className="vv-empty-sub">{t.views.briefs.emptySub}</div>
          </div>
        ) : (
          <div className="vv-table inbox-table">
            <div className="vv-row vv-head-row">
              <span className="ic-score">{t.views.briefs.colScore}</span>
              <span className="ic-title">{t.views.briefs.colTitle}</span>
              <span className="ic-tracked">{t.views.briefs.colTracked}</span>
              <span className="ic-kind">{t.views.briefs.colKind}</span>
              <span className="ic-status">{t.views.briefs.colStatus}</span>
              <span className="ic-date">{t.views.briefs.colDate}</span>
              <span className="ic-act">{t.views.briefs.colAct}</span>
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
                    <span className={`vk-chip kind-${item.kind}`}>{t.labels.signalKind[item.kind]}</span>
                  </span>
                  <span className="ic-status">
                    <span className={`vstat s-${item.uiStatus}`}>{STATUS_INBOX_LABEL[item.uiStatus]}</span>
                  </span>
                  <span className="ic-date">{item.brief.createdAt.slice(0, 10)}</span>
                  <span className="ic-act">
                    {item.uiStatus === "pending" ? (
                      <>
                        <button type="button" className="vbtn xs" onClick={() => store.decide(item.brief.id, "rejected")}>
                          {t.views.briefs.actReject}
                        </button>
                        <button type="button" className="vbtn xs" onClick={() => store.decide(item.brief.id, "watch")}>
                          {t.views.briefs.actWatch}
                        </button>
                        <button type="button" className="vbtn xs primary" onClick={() => store.decide(item.brief.id, "pool")}>
                          {t.views.briefs.actPass}
                        </button>
                      </>
                    ) : (
                      <button type="button" className="vbtn xs" onClick={() => jumpToBrief(item.brief.id)}>
                        {t.views.briefs.view}
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
