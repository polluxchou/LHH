"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductionPackage, ScriptSection, StoryboardShot } from "@/lib/domain/production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { topicFormatLabel } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

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
  /** 触发 DeepSeek 重新生成脚本+分镜;返回 Promise 以驱动 loading 态。无则不显示该按钮。 */
  onGenerate?: (targetDuration: string) => Promise<void>;
}

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
  onGenerate,
}: ProductionStudioProps) {
  const t = useCopy();
  const s = t.studio;
  const TABS: Array<{ id: StudioTab; label: string; en: string }> = [
    { id: "script", label: s.tabScript, en: "SCRIPT" },
    { id: "storyboard", label: s.tabStoryboard, en: "STORYBOARD" },
    { id: "task", label: s.tabTask, en: "PRODUCTION TASK" },
  ];
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

  const [generating, setGenerating] = useState(false);
  // 目标时长(分钟):默认 3,提供 1/3/9 快捷选项,可自定义。
  const [durationMin, setDurationMin] = useState("3");
  const targetDuration = `${(durationMin || "3").trim()} min`;
  const runGenerate = async () => {
    if (!onGenerate || generating) return;
    setGenerating(true);
    onLog("info", s.generateLog(targetDuration, title));
    try {
      await onGenerate(targetDuration);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="studio-backdrop" onClick={onClose}>
      <div className="studio" onClick={(event) => event.stopPropagation()}>
        <header className="studio-head">
          <div className="studio-head-left">
            <div className="studio-kicker">{s.kicker}</div>
            <h2 className="studio-title">{title}</h2>
            <div className="studio-q">{s.coreQuestion(topicCard.coreQuestion)}</div>
          </div>
          <div className="studio-head-right">
            <div className="studio-meta-row">
              <span className="studio-meta-chip">{topicFormatLabel(topicCard, t.labels.format)}</span>
              <span className="studio-meta-chip">{s.value(score)}</span>
            </div>
            <button type="button" className="studio-close" onClick={onClose} aria-label={s.close}>
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
                <b>{production.script.sections.length}</b> {s.statSegments} · <b>{totalWords}</b> {s.statWords} ·{" "}
                {s.statEst} <b>{production.script.targetDuration}</b>
              </>
            ) : null}
            {tab === "storyboard" ? (
              <>
                <b>{production.storyboard.length}</b> {s.statShots} · {s.statEst} <b>{lastShotEnd}</b>
              </>
            ) : null}
            {tab === "task" ? (
              <>
                <b>{doneCount}</b>/<b>{production.task.checklist.length}</b> {s.statDone}
              </>
            ) : null}
          </div>
        </nav>

        <main className="studio-body">
          {tab === "script" ? (
            <ScriptPanel
              sections={production.script.sections}
              targetDuration={targetDuration}
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
          <span className="studio-foot-info">{s.draftStatus}</span>
          <span className="studio-foot-spacer" />
          <button
            type="button"
            className="studio-foot-btn ghost"
            onClick={() => onLog("info", s.exportLog(TABS.find((item) => item.id === tab)?.label ?? "", title))}
          >
            {s.exportMd}
          </button>
          {onGenerate ? (
            <>
              <span className="studio-foot-dur" title={s.durTitle}>
                <span className="dur-label">{s.durLabel}</span>
                <select
                  className="dur-select"
                  value={durationMin}
                  disabled={generating}
                  onChange={(event) => setDurationMin(event.target.value)}
                  aria-label={s.durAria}
                >
                  <option value="1">1 min</option>
                  <option value="2">2 min</option>
                  <option value="3">3 min</option>
                  <option value="9">9 min</option>
                </select>
              </span>
              <button
                type="button"
                className="studio-foot-btn primary"
                disabled={generating}
                onClick={runGenerate}
              >
                {generating ? s.generating : s.generate(targetDuration)}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="studio-foot-btn ghost"
            onClick={() => {
              onReset();
              onLog("warning", s.regenerateLog(title));
            }}
          >
            {s.regenerate}
          </button>
          <button
            type="button"
            className="studio-foot-btn primary"
            onClick={() => {
              onLog("success", s.sendLog(title));
              onClose();
            }}
          >
            {s.sendToOwner}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ScriptPanel({
  sections,
  targetDuration,
  onEditSection,
  onLog,
}: {
  sections: ScriptSection[];
  /** 当前选中的目标时长（跟随底栏下拉） */
  targetDuration: string;
  onEditSection: (sectionId: string, body: string) => void;
  onLog: (level: StudioLogLevel, message: string) => void;
}) {
  const s = useCopy().studio;
  return (
    <div className="script-panel">
      <div className="script-rail">
        <div className="script-rail-title">{s.scriptOutline}</div>
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
            <span>{s.targetDuration}</span>
            <b>{targetDuration}</b>
          </div>
          <div className="kv">
            <span>{s.paceRef}</span>
            <b>{s.paceValue}</b>
          </div>
          <div className="kv">
            <span>{s.style}</span>
            <b>{s.styleValue}</b>
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
                  {section.duration} · {s.sectionChars(section.body.length)}
                </div>
              </div>
              <button
                type="button"
                className="sec-regen"
                title={s.regenSectionTitle}
                onClick={() => onLog("info", s.regenSectionLog(section.label))}
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
  silent: boolean;
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
  const s = useCopy().studio;
  const [editingShot, setEditingShot] = useState<number | null>(null);
  const [draft, setDraft] = useState<ShotDraft | null>(null);

  const beginEdit = (shot: StoryboardShot) => {
    setEditingShot(shot.n);
    setDraft({ time: shot.time, shot: shot.shot, silent: shot.silent ?? false, visual: shot.visual, notes: shot.notes });
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
    onLog("success", s.shotUpdatedLog(String(editingShot).padStart(2, "0")));
    cancelEdit();
  };

  const patchDraft = (patch: Partial<ShotDraft>) => {
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));
  };

  return (
    <div className="sb-panel">
      <div className="sb-help">
        <span>{s.sbHelpDerived}</span>
      </div>
      <div className="sb-table">
        <div className="sb-row sb-head">
          <span className="c-n">#</span>
          <span className="c-thumb">{s.sbColThumb}</span>
          <span className="c-time">{s.sbColTime}</span>
          <span className="c-shot">{s.sbColShot}</span>
          <span className="c-vo">{s.sbColVo}</span>
          <span className="c-visual">{s.sbColVisual}</span>
          <span className="c-notes">{s.sbColNotes}</span>
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
                  <label className="sb-silent">
                    <input
                      type="checkbox"
                      checked={draft.silent ?? false}
                      onChange={(event) => patchDraft({ silent: event.target.checked })}
                    />
                    {s.sbSilentToggle}
                  </label>
                </span>
                <span className="c-shot">
                  <textarea
                    className="sb-textarea"
                    value={draft.shot}
                    onChange={(event) => patchDraft({ shot: event.target.value })}
                    rows={3}
                  />
                </span>
                <span className="c-vo">{shot.silent ? "（无）" : `“${shot.voiceOver}”`}</span>
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
                      {s.save}
                    </button>
                    <button type="button" className="sb-edit-btn" onClick={cancelEdit}>
                      {s.cancel}
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
              <span className="c-vo">{shot.silent ? "（无）" : `“${shot.voiceOver}”`}</span>
              <span className="c-visual">{shot.visual}</span>
              <span className="c-notes">
                {shot.notes || "—"}
                <button type="button" className="c-edit" title={s.editShotTitle} onClick={() => beginEdit(shot)}>
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
  const s = useCopy().studio;
  const task = production.task;
  const checks = task.checklist;
  const toggle = (id: string) => {
    const item = checks.find((check) => check.id === id);

    onToggleCheck(id);

    if (item) {
      onLog("info", s.taskToggleLog(item.done ? s.taskUnmark : s.taskMarkDone, item.label));
    }
  };
  const done = checks.filter((check) => check.done).length;
  const pct = checks.length > 0 ? Math.round((done / checks.length) * 100) : 0;

  return (
    <div className="task-panel">
      <div className="task-grid">
        <div className="task-kv">
          <span className="k">{s.taskTitle}</span>
          <span className="v strong">{task.title}</span>
        </div>
        <div className="task-kv">
          <span className="k">{s.taskFormat}</span>
          <span className="v">{task.format}</span>
        </div>
        <div className="task-kv">
          <span className="k">{s.taskChannel}</span>
          <span className="v">{task.channel}</span>
        </div>
        <div className="task-kv">
          <span className="k">{s.taskOwner}</span>
          <span className="v">{task.owner}</span>
        </div>
        <div className="task-kv">
          <span className="k">{s.taskDeadline}</span>
          <span className="v strong">{task.deadline}</span>
        </div>
        <div className="task-kv">
          <span className="k">{s.taskBudget}</span>
          <span className="v">{task.budget}</span>
        </div>
      </div>

      <div className="task-progress">
        <div className="task-progress-head">
          <span className="t">{s.checklist}</span>
          <span className="n">
            <b>{done}</b> / {checks.length} {s.completed} · {pct}%
          </span>
        </div>
        <div className="task-pbar">
          <i style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="task-checklist">
        {checks.map((check) => (
          <li key={check.id} className={check.done ? "done" : ""}>
            <button type="button" className="check-toggle" onClick={() => toggle(check.id)} aria-label={s.toggleDone}>
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
