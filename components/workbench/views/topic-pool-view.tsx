"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { buildBriefViewModel, buildPoolItems } from "@/components/workbench/selectors";
import { formatDateShort, topicFormatLabel } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

type PoolFilter = "all" | "mine" | "unowned";

export function TopicPoolView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const router = useRouter();
  const t = useCopy();
  const home = locale === "zh" ? "/zh" : "/";
  const [filter, setFilter] = useState<PoolFilter>("all");
  const FILTERS: Array<[PoolFilter, string]> = [
    ["all", t.views.pool.filter.all],
    ["mine", t.views.pool.filter.mine],
    ["unowned", t.views.pool.filter.unowned],
  ];

  const pool = useMemo(() => buildPoolItems(state), [state]);

  const counts = useMemo(
    () => ({
      all: pool.length,
      mine: pool.filter((item) => item.owner?.id === store.currentMember.id).length,
      unowned: pool.filter((item) => !item.owner).length,
    }),
    [pool, store.currentMember],
  );

  const filtered = useMemo(() => {
    if (filter === "mine") {
      return pool.filter((item) => item.owner?.id === store.currentMember.id);
    }

    if (filter === "unowned") {
      return pool.filter((item) => !item.owner);
    }

    return pool;
  }, [pool, filter, store.currentMember]);

  const jump = (briefId: string, tab: "sources" | "pool") => {
    store.focusBrief(briefId, tab);
    router.push(home);
  };

  return (
    <div className="vv">
      <header className="vv-head">
        <div className="vv-head-left">
          <div className="vv-kicker">{t.views.pool.kicker}</div>
          <h2 className="vv-title">{t.views.pool.title}</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            {t.views.backToWorkbench}
          </button>
        </div>
      </header>

      <div className="vv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">{t.views.toolView}</span>
          <div className="vv-pills">
            {FILTERS.map(([key, label]: [PoolFilter, string]) => (
              <button
                key={key}
                type="button"
                className={`vv-pill ${filter === key ? "active" : ""}`}
                onClick={() => setFilter(key)}
              >
                {label} <span className="n">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="vv-body">
        {filtered.length === 0 ? (
          <div className="vv-empty">
            <div className="vv-empty-glyph">📦</div>
            <div className="vv-empty-title">{t.views.pool.emptyTitle}</div>
            <div className="vv-empty-sub">{t.views.pool.emptySub}</div>
          </div>
        ) : (
          <div className="pool-grid">
            {filtered.map((item) => {
              const briefId = item.topicCard.sourceEditorialBriefId;
              const brief = state.editorialBriefs.find((entry) => entry.id === briefId);
              const object = brief
                ? state.trackingObjects.find((entry) => entry.id === brief.trackingObjectId)
                : undefined;
              const kind = brief ? buildBriefViewModel(state, brief).kind : "milestone";
              const production = state.productionDrafts[briefId];
              const isMine = item.owner?.id === store.currentMember.id;
              const checklistDone = production?.task.checklist.some((check) => check.done) ?? false;

              return (
                <article key={item.topicCard.id} className={`poolcard ${isMine ? "mine" : ""}`}>
                  <div className="poolcard-head">
                    <span className="pc-kind">{t.labels.signalKind[kind]}</span>
                    <span className="pc-score">{t.views.pool.value(item.score)}</span>
                    <span className="pc-tracked">· {object ? (object.nameZh ?? object.name) : "—"}</span>
                    {item.createdAt ? <span>· {formatDateShort(item.createdAt)}</span> : null}
                  </div>
                  <h3 className="poolcard-title">{item.topicCard.workingTitle}</h3>
                  <div className="poolcard-q">{t.views.pool.coreQuestion(item.topicCard.coreQuestion)}</div>
                  <div className="poolcard-format">{topicFormatLabel(item.topicCard, t.labels.format)}</div>
                  <div className="poolcard-prod">
                    <span className="poolcard-prod-l">{t.views.pool.prodLabel}</span>
                    <span className={`pp-chip ${production?.script ? "on" : ""}`}>{t.views.pool.prodScript}</span>
                    <span className={`pp-chip ${production?.storyboard ? "on" : ""}`}>{t.views.pool.prodStoryboard}</span>
                    <span className={`pp-chip ${production && checklistDone ? "on" : ""}`}>{t.views.pool.prodTask}</span>
                  </div>
                  <div className="poolcard-people">
                    {item.addedBy ? (
                      <span className="pp-row">
                        <span className="pavatar" style={{ background: item.addedBy.color }}>
                          {item.addedBy.avatarChar}
                        </span>
                        <span className="pp-text">{t.views.pool.addedBy(item.addedBy.name)}</span>
                      </span>
                    ) : null}
                    {item.owner ? (
                      <span className={`pp-row ${isMine ? "mine" : ""}`}>
                        <span className="pavatar" style={{ background: item.owner.color }}>
                          {item.owner.avatarChar}
                        </span>
                        <span className="pp-text">
                          {t.views.pool.owner(item.owner.name)}
                          {isMine ? t.views.pool.mineSuffix : ""}
                        </span>
                      </span>
                    ) : (
                      <button type="button" className="pp-claim" onClick={() => store.claim(item.topicCard.id)}>
                        {t.views.pool.claim}
                      </button>
                    )}
                  </div>
                  <div className="poolcard-actions">
                    <button type="button" className="vbtn" onClick={() => jump(briefId, "sources")}>
                      {t.views.pool.viewBrief}
                    </button>
                    <span className="poolcard-spacer" />
                    <button type="button" className="vbtn primary" onClick={() => jump(briefId, "pool")}>
                      {t.views.pool.openStudio}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
