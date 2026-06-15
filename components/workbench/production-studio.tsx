"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductionPackage, ProductionScript, ScriptSection, StoryboardShot } from "@/lib/domain/production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { topicFormatLabel } from "@/components/workbench/helpers";

export type StudioTab = "script" | "storyboard" | "task";

type StudioLogLevel = "info" | "success" | "warning";

interface ProductionStudioProps {
  brief: EditorialBrief;
  topicCard: TopicCard;
  /** engine-held draft — edits persist across close/reopen (二次编辑) */
  production: ProductionPackage;
  score: number;
  initialTab: StudioTab;
  onClose: () => void;
  onLog: (level: StudioLogLevel, message: string) => void;
  onEditSection: (sectionId: string, body: string) => void;
  onEditShot: (shotNumber: number, patch: Partial<Omit<StoryboardShot, "n">>) => void;
  onToggleCheck: (itemId: string) => void;
  onReset: () => void;
}

const TABS: Array<{ id: StudioTab; label: string; en: string }> = [
  { id: "script", label: "脚本", en: "SCRIPT" },
  { id: "storyboard", label: "分镜", en: "STORYBOARD" },
  { id: "task", label: "视频任务", en: "PRODUCTION TASK" },
];

export function ProductionStudio({
  brief,
  topicCard,
  production,
  score,
  initialTab,
  onClose,
  onLog,
  onEditSection,
  onEditShot,
  onToggleCheck,
  onReset,
}: ProductionStudioProps) {
  const [tab, setTab] = useState<StudioTab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, topicCard.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const totalWords = useMemo(
    () => production.script.sections.reduce((sum, section) => sum + section.body.length, 0),
    [production.script.sections],
  );
  const doneCount = production.task.checklist.filter((item) => item.done).length;
  const lastShotEnd = production.storyboard.at(-1)?.time.split("-")[1] ?? "";
  const title = topicCard.workingTitle || brief.briefTitle;

  return (
    <div className="studio-backdrop" onClick={onClose}>
      <div className="studio" onClick={(event) => event.stopPropagation()}>
        <header className="studio-head">
          <div className="studio-head-left">
            <div className="studio-kicker">PRODUCTION · 选题工作台</div>
            <h2 className="studio-title">{title}</h2>
            <div className="studio-q">核心问题 · {topicCard.coreQuestion}</div>
          </div>
          <div className="studio-head-right">
            <div className="studio-meta-row">
              <span className="studio-meta-chip">{topicFormatLabel(topicCard)}</span>
              <span className="studio-meta-chip">价值 {score}</span>
            </div>
            <button type="button" className="studio-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </header>

        <nav className="studio-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`studio-tab ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              <span className="lbl">{item.label}</span>
              <span className="en">{item.en}</span>
            </button>
          ))}
          <div className="studio-tabs-spacer" />
          <div className="studio-stats">
            {tab === "script" ? (
              <>
                <b>{production.script.sections.length}</b> 段 · <b>{totalWords}</b> 字 · 估时{" "}
                <b>{production.script.targetDuration}</b>
              </>
            ) : null}
            {tab === "storyboard" ? (
              <>
                <b>{production.storyboard.length}</b> 镜 · 估时 <b>{lastShotEnd}</b>
              </>
            ) : null}
            {tab === "task" ? (
              <>
                <b>{doneCount}</b>/<b>{production.task.checklist.length}</b> 已完成
              </>
            ) : null}
          </div>
        </nav>

        <main className="studio-body">
          {tab === "script" ? (
            <ScriptPanel
              sections={production.script.sections}
              meta={production.script}
              onEditSection={onEditSection}
              onLog={onLog}
            />
          ) : null}
          {tab === "storyboard" ? (
            <StoryboardPanel shots={production.storyboard} onEditShot={onEditShot} onLog={onLog} />
          ) : null}
          {tab === "task" ? (
            <TaskPanel production={production} onToggleCheck={onToggleCheck} onLog={onLog} />
          ) : null}
        </main>

        <footer className="studio-foot">
          <span className="studio-foot-info">草稿状态 · 由 AI 自候选信号自动展开 · 编辑可随时二次修改</span>
          <span className="studio-foot-spacer" />
          <button
            type="button"
            className="studio-foot-btn ghost"
            onClick={() => onLog("info", `导出 ${TABS.find((item) => item.id === tab)?.label} · ${title}（演示）`)}
          >
            导出 .md
          </button>
          <button
            type="button"
            className="studio-foot-btn ghost"
            onClick={() => {
              onReset();
              onLog("warning", `重新生成 · ${title} 的草稿已重置为初始版本`);
            }}
          >
            ↻ 重新生成
          </button>
          <button
            type="button"
            className="studio-foot-btn primary"
            onClick={() => {
              onLog("success", `已发给负责人 · ${title}（演示）`);
              onClose();
            }}
          >
            发给负责人
          </button>
        </footer>
      </div>
    </div>
  );
}

function ScriptPanel({
  sections,
  meta,
  onEditSection,
  onLog,
}: {
  sections: ScriptSection[];
  meta: ProductionScript;
  onEditSection: (sectionId: string, body: string) => void;
  onLog: (level: StudioLogLevel, message: string) => void;
}) {
  return (
    <div className="script-panel">
      <div className="script-rail">
        <div className="script-rail-title">脚本结构</div>
        <ol className="script-toc">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a href={`#sec-${section.id}`}>
                <span className="toc-n">{String(index + 1).padStart(2, "0")}</span>
                <span className="toc-l">{section.label}</span>
                <span className="toc-d">{section.duration}</span>
              </a>
            </li>
          ))}
        </ol>
        <div className="script-rail-meta">
          <div className="kv">
            <span>目标时长</span>
            <b>{meta.targetDuration}</b>
          </div>
          <div className="kv">
            <span>语速参考</span>
            <b>≈ 280 字 / 分</b>
          </div>
          <div className="kv">
            <span>风格</span>
            <b>克制 · 文学化 · 不抒情</b>
          </div>
        </div>
      </div>
      <div className="script-content">
        {sections.map((section, index) => (
          <section key={section.id} id={`sec-${section.id}`} className="script-section">
            <header>
              <span className="sec-n">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <div className="sec-l">{section.label}</div>
                <div className="sec-d">
                  {section.duration} · {section.body.length} 字
                </div>
              </div>
              <button
                type="button"
                className="sec-regen"
                title="只重生成这一段"
                onClick={() => onLog("info", `重新生成段落：${section.label}`)}
              >
                ↻
              </button>
            </header>
            <textarea
              className="sec-body"
              value={section.body}
              onChange={(event) => onEditSection(section.id, event.target.value)}
              rows={Math.max(4, Math.ceil(section.body.length / 28) + 1)}
            />
          </section>
        ))}
      </div>
    </div>
  );
}

interface ShotDraft {
  time: string;
  shot: string;
  voiceOver: string;
  visual: string;
  notes: string;
}

function StoryboardPanel({
  shots,
  onEditShot,
  onLog,
}: {
  shots: StoryboardShot[];
  onEditShot: (shotNumber: number, patch: Partial<Omit<StoryboardShot, "n">>) => void;
  onLog: (level: StudioLogLevel, message: string) => void;
}) {
  const [editingShot, setEditingShot] = useState<number | null>(null);
  const [draft, setDraft] = useState<ShotDraft | null>(null);

  const beginEdit = (shot: StoryboardShot) => {
    setEditingShot(shot.n);
    setDraft({ time: shot.time, shot: shot.shot, voiceOver: shot.voiceOver, visual: shot.visual, notes: shot.notes });
  };

  const cancelEdit = () => {
    setEditingShot(null);
    setDraft(null);
  };

  const commitEdit = () => {
    if (editingShot === null || !draft) {
      return;
    }

    onEditShot(editingShot, { ...draft });
    onLog("success", `分镜已更新 · 第 ${String(editingShot).padStart(2, "0")} 镜`);
    cancelEdit();
  };

  const patchDraft = (patch: Partial<ShotDraft>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
  };

  return (
    <div className="sb-panel">
      <div className="sb-help">
        <span>📝 这是 AI 据脚本自动拆分的分镜建议 · 时长加总不必等于脚本总长 · 双击行（或点 ✎）可编辑，修改会保留</span>
      </div>
      <div className="sb-table">
        <div className="sb-row sb-head">
          <span className="c-n">#</span>
          <span className="c-thumb">画面</span>
          <span className="c-time">时长</span>
          <span className="c-shot">镜头描述</span>
          <span className="c-vo">旁白</span>
          <span className="c-visual">B-roll / 资料</span>
          <span className="c-notes">备注</span>
        </div>
        {shots.map((shot) => {
          const isEditing = editingShot === shot.n && draft !== null;

          if (isEditing) {
            return (
              <div key={shot.n} className="sb-row editing">
                <span className="c-n">{String(shot.n).padStart(2, "0")}</span>
                <span className="c-thumb">
                  <span className="thumb-box">
                    <span className="thumb-glyph">🎞</span>
                  </span>
                </span>
                <span className="c-time">
                  <input className="sb-input" value={draft.time} onChange={(event) => patchDraft({ time: event.target.value })} />
                </span>
                <span className="c-shot">
                  <textarea
                    className="sb-textarea"
                    value={draft.shot}
                    onChange={(event) => patchDraft({ shot: event.target.value })}
                    rows={3}
                  />
                </span>
                <span className="c-vo">
                  <textarea
                    className="sb-textarea vo"
                    value={draft.voiceOver}
                    onChange={(event) => patchDraft({ voiceOver: event.target.value })}
                    rows={3}
                  />
                </span>
                <span className="c-visual">
                  <textarea
                    className="sb-textarea"
                    value={draft.visual}
                    onChange={(event) => patchDraft({ visual: event.target.value })}
                    rows={3}
                  />
                </span>
                <span className="c-notes">
                  <textarea
                    className="sb-textarea"
                    value={draft.notes}
                    onChange={(event) => patchDraft({ notes: event.target.value })}
                    rows={2}
                  />
                  <span className="sb-edit-actions">
                    <button type="button" className="sb-edit-btn primary" onClick={commitEdit}>
                      保存
                    </button>
                    <button type="button" className="sb-edit-btn" onClick={cancelEdit}>
                      取消
                    </button>
                  </span>
                </span>
              </div>
            );
          }

          return (
            <div key={shot.n} className="sb-row" onDoubleClick={() => beginEdit(shot)}>
              <span className="c-n">{String(shot.n).padStart(2, "0")}</span>
              <span className="c-thumb">
                <span className="thumb-box">
                  <span className="thumb-glyph">🎞</span>
                </span>
              </span>
              <span className="c-time">{shot.time}</span>
              <span className="c-shot">{shot.shot}</span>
              <span className="c-vo">“{shot.voiceOver}”</span>
              <span className="c-visual">{shot.visual}</span>
              <span className="c-notes">
                {shot.notes || "—"}
                <button type="button" className="c-edit" title="编辑这一镜" onClick={() => beginEdit(shot)}>
                  ✎
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskPanel({
  production,
  onToggleCheck,
  onLog,
}: {
  production: ProductionPackage;
  onToggleCheck: (itemId: string) => void;
  onLog: (level: StudioLogLevel, message: string) => void;
}) {
  const task = production.task;
  const checks = task.checklist;
  const toggle = (id: string) => {
    const item = checks.find((check) => check.id === id);

    onToggleCheck(id);

    if (item) {
      onLog("info", `任务项 · ${item.done ? "取消完成" : "标记完成"}：${item.label}`);
    }
  };
  const done = checks.filter((check) => check.done).length;
  const pct = checks.length > 0 ? Math.round((done / checks.length) * 100) : 0;

  return (
    <div className="task-panel">
      <div className="task-grid">
        <div className="task-kv">
          <span className="k">工作标题</span>
          <span className="v strong">{task.title}</span>
        </div>
        <div className="task-kv">
          <span className="k">内容形式</span>
          <span className="v">{task.format}</span>
        </div>
        <div className="task-kv">
          <span className="k">分发频道</span>
          <span className="v">{task.channel}</span>
        </div>
        <div className="task-kv">
          <span className="k">负责人</span>
          <span className="v">{task.owner}</span>
        </div>
        <div className="task-kv">
          <span className="k">交付日期</span>
          <span className="v strong">{task.deadline}</span>
        </div>
        <div className="task-kv">
          <span className="k">预算</span>
          <span className="v">{task.budget}</span>
        </div>
      </div>

      <div className="task-progress">
        <div className="task-progress-head">
          <span className="t">生产清单</span>
          <span className="n">
            <b>{done}</b> / {checks.length} 完成 · {pct}%
          </span>
        </div>
        <div className="task-pbar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="task-checklist">
        {checks.map((check) => (
          <li key={check.id} className={check.done ? "done" : ""}>
            <button type="button" className="check-toggle" onClick={() => toggle(check.id)} aria-label="切换完成">
              {check.done ? "✓" : ""}
            </button>
            <div className="task-info">
              <div className="task-label">{check.label}</div>
              <div className="task-who">{check.who}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
