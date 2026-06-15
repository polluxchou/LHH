"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { buildBriefViewModel, buildPoolItems } from "@/components/workbench/selectors";
import { KIND_LABELS, formatDateShort, topicFormatLabel } from "@/components/workbench/helpers";

type PoolFilter = "all" | "mine" | "unowned";

const FILTERS: Array<[PoolFilter, string]> = [
  ["all", "全部"],
  ["mine", "我负责的"],
  ["unowned", "未认领"],
];

export function TopicPoolView({ locale }: { locale: Locale }) {
  const store = useWorkflow();
  const { state } = store;
  const router = useRouter();
  const home = locale === "zh" ? "/zh" : "/";
  const [filter, setFilter] = useState<PoolFilter>("all");

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
          <div className="vv-kicker">选题库 · TOPIC POOL</div>
          <h2 className="vv-title">已通过筛选的选题 · 团队共享</h2>
        </div>
        <div className="vv-head-right">
          <button type="button" className="vv-action ghost" onClick={() => router.push(home)}>
            返回工作台
          </button>
        </div>
      </header>

      <div className="vv-toolbar">
        <div className="vv-tool">
          <span className="vv-tool-l">视图</span>
          <div className="vv-pills">
            {FILTERS.map(([key, label]) => (
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
            <div className="vv-empty-title">这里还没有选题</div>
            <div className="vv-empty-sub">回工作台筛选简报，通过的会自动进入选题库。</div>
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
                    <span className="pc-kind">{KIND_LABELS[kind]}</span>
                    <span className="pc-score">价值 {item.score}</span>
                    <span className="pc-tracked">· {object ? (object.nameZh ?? object.name) : "—"}</span>
                    {item.createdAt ? <span>· {formatDateShort(item.createdAt)}</span> : null}
                  </div>
                  <h3 className="poolcard-title">{item.topicCard.workingTitle}</h3>
                  <div className="poolcard-q">核心问题 · {item.topicCard.coreQuestion}</div>
                  <div className="poolcard-format">{topicFormatLabel(item.topicCard)}</div>
                  <div className="poolcard-prod">
                    <span className="poolcard-prod-l">生产进度</span>
                    <span className={`pp-chip ${production?.script ? "on" : ""}`}>脚本</span>
                    <span className={`pp-chip ${production?.storyboard ? "on" : ""}`}>分镜</span>
                    <span className={`pp-chip ${production && checklistDone ? "on" : ""}`}>任务</span>
                  </div>
                  <div className="poolcard-people">
                    {item.addedBy ? (
                      <span className="pp-row">
                        <span className="pavatar" style={{ background: item.addedBy.color }}>
                          {item.addedBy.avatarChar}
                        </span>
                        <span className="pp-text">{item.addedBy.name} 加入</span>
                      </span>
                    ) : null}
                    {item.owner ? (
                      <span className={`pp-row ${isMine ? "mine" : ""}`}>
                        <span className="pavatar" style={{ background: item.owner.color }}>
                          {item.owner.avatarChar}
                        </span>
                        <span className="pp-text">
                          {item.owner.name} 负责{isMine ? "（你）" : ""}
                        </span>
                      </span>
                    ) : (
                      <button type="button" className="pp-claim" onClick={() => store.claim(item.topicCard.id)}>
                        + 我来认领
                      </button>
                    )}
                  </div>
                  <div className="poolcard-actions">
                    <button type="button" className="vbtn" onClick={() => jump(briefId, "sources")}>
                      查看原简报
                    </button>
                    <span className="poolcard-spacer" />
                    <button type="button" className="vbtn primary" onClick={() => jump(briefId, "pool")}>
                      打开工作台
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
