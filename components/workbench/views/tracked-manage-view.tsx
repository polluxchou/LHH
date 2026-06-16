"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { useSpaceSession } from "@/components/account/space-provider";
import { getSignalCounts } from "@/components/workbench/selectors";
import { priorityClass } from "@/components/workbench/helpers";
import { canDeleteTrackingObject } from "@/lib/workflow/can-delete-tracking-object";
import type { TrackingObject, TrackingObjectType } from "@/lib/domain/types";
import { useCopy } from "@/lib/i18n/locale-context";

const TYPE_GLYPH: Record<TrackingObjectType, string> = { company: "🏢", facility: "🚀", program: "🛰", project: "🛰" };

type SortKey = "signals" | "priority" | "update" | "name";

export function TrackedManageView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const session = useSpaceSession();
  const router = useRouter();
  const t = useCopy();
  const tv = t.views.tracked;
  const home = locale === "zh" ? "/zh" : "/";
  const TYPE_LABEL: Record<TrackingObjectType, string> = tv.type;
  const PRIO_LABEL = tv.prio;
  const SORTS: Array<[SortKey, string]> = [
    ["signals", tv.sortSignals],
    ["priority", tv.sortPriority],
    ["update", tv.sortUpdate],
    ["name", tv.sortName],
  ];
  const [sortBy, setSortBy] = useState<SortKey>("signals");
  const [pendingDelete, setPendingDelete] = useState<TrackingObject | null>(null);

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
          <div className="vv-kicker">{tv.kicker}</div>
          <h2 className="vv-title">{tv.title}</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action" onClick={() => store.setAddOpen(true)}>
            {tv.addObject}
          </button>
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            {t.views.backToWorkbench}
          </button>
        </div>
      </header>

      <div className="vv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">{t.views.toolView}</span>
          <div className="vv-pills">
            <button
              type="button"
              className={`vv-pill ${store.scope === "mine" ? "active" : ""}`}
              onClick={() => store.setScope("mine")}
            >
              {t.views.scopeMine} <span className="n">{mineCount}</span>
            </button>
            <button
              type="button"
              className={`vv-pill ${store.scope === "team" ? "active" : ""}`}
              onClick={() => store.setScope("team")}
            >
              {t.views.scopeTeam} <span className="n">{state.trackingObjects.length}</span>
            </button>
          </div>
        </div>
        <div className="vv-tool">
          <span className="vv-tool-l">{t.views.toolSort}</span>
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
            <span className="vc-name">{tv.colObject}</span>
            <span className="vc-type">{tv.colType}</span>
            <span className="vc-track">{tv.colTrack}</span>
            <span className="vc-prio">{tv.colPrio}</span>
            <span className="vc-hq">{tv.colHq}</span>
            <span className="vc-update">{tv.colUpdate}</span>
            <span className="vc-stats">{tv.colStats}</span>
            <span className="vc-subs">{tv.colSubs}</span>
            <span className="vc-act">{tv.colAct}</span>
          </div>
          {list.map((object) => {
            const isSubscribed = store.currentMember.trackingObjectIds.includes(object.id);
            const subscribers = state.teamMembers.filter((member) => member.trackingObjectIds.includes(object.id));
            const prio = priorityClass(object.priority);
            const displayName = object.nameZh ?? object.name;
            const canDelete = canDeleteTrackingObject({
              createdBy: object.createdBy,
              userId: session.userId,
              role: session.currentRole,
              isOwner: session.isOwnerOfCurrent,
            });

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
                    {tv.view}
                  </button>
                  <button
                    type="button"
                    className={`vbtn ${isSubscribed ? "subbed" : "subscribe"}`}
                    onClick={() => store.subToggle(object.id)}
                  >
                    {isSubscribed ? tv.subbed : tv.subscribe}
                  </button>
                  {canDelete ? (
                    <button
                      type="button"
                      className="vbtn danger"
                      onClick={() => setPendingDelete(object)}
                      title={tv.deleteTitleAttr}
                    >
                      {tv.delete}
                    </button>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {pendingDelete ? (
        <div className="at-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="at-dialog" onClick={(event) => event.stopPropagation()}>
            <header className="at-head">
              <div>
                <div className="at-kicker">{tv.deleteKicker}</div>
                <h2 className="at-title">{tv.deleteTitle(pendingDelete.nameZh ?? pendingDelete.name)}</h2>
                <div className="at-sub">
                  {tv.deleteWarnLead}
                  <span className="at-warn">
                    {tv.deleteWarn(
                      signalCounts[pendingDelete.id] ?? 0,
                      briefCounts[pendingDelete.id] ?? 0,
                      state.teamMembers.filter((m) => m.trackingObjectIds.includes(pendingDelete.id)).length,
                    )}
                  </span>
                  {tv.deleteWarnTail}
                </div>
              </div>
              <button type="button" className="at-close" onClick={() => setPendingDelete(null)} aria-label={tv.close}>
                ✕
              </button>
            </header>
            <footer className="at-foot">
              <span className="at-foot-info">{tv.deleteFootInfo}</span>
              <span className="at-foot-spacer" />
              <button type="button" className="at-foot-btn ghost" onClick={() => setPendingDelete(null)}>
                {tv.cancel}
              </button>
              <button
                type="button"
                className="at-foot-btn danger"
                onClick={() => {
                  store.removeTracked(pendingDelete.id);
                  setPendingDelete(null);
                }}
              >
                {tv.confirmDelete}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
