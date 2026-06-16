"use client";

import type { CandidateSignal } from "@/lib/domain/types";
import { EmptyState } from "@/components/workbench/empty-state";
import { signalKind } from "@/components/workbench/helpers";
import { SectionHint } from "@/components/workbench/section-hint";
import { useCopy } from "@/lib/i18n/locale-context";
import { isLikelyHomepageUrl } from "@/lib/search/url";

interface SignalStripProps {
  signals: CandidateSignal[];
  briefBySignalId: Record<string, string>;
  /** 每条信号的原始出处链接（首个来源），用于跳转到对应新闻 */
  sourceById: Record<string, { url: string; publisher: string | null }>;
  /** 正在调 AI 生成简报的信号 id（按钮 loading） */
  generatingIds?: ReadonlySet<string>;
  onGenerate: (signalId: string) => void;
  onOpenBrief: (signalId: string) => void;
}

export function SignalStrip({
  signals,
  briefBySignalId,
  sourceById,
  generatingIds,
  onGenerate,
  onOpenBrief,
}: SignalStripProps) {
  const t = useCopy();

  if (signals.length === 0) {
    return (
      <div className="signals-section">
        <EmptyState flush glyph="🛰" title={t.workbench.signals.emptyTitle} sub={t.workbench.signals.emptySub} />
      </div>
    );
  }

  return (
    <div className="signals-section">
      <div className="section-head inline">
        <span className="kicker">{t.workbench.signals.sectionTitle}</span>
        <SectionHint label="SIGNALS" description={t.workbench.signals.hint} />
        <span className="count">{signals.length}</span>
      </div>
      <div className="signals-row">
        {signals.map((signal) => {
          const kind = signalKind(signal);
          const isDuplicate = signal.noveltyStatus === "duplicate";
          const hasBrief = Boolean(briefBySignalId[signal.id]);
          const strength = Math.round(signal.confidence * 100);
          const source = sourceById[signal.id];

          return (
            <div key={signal.id} className={`signal-card ${isDuplicate ? "dup" : ""}`}>
              <span className={`signal-kind ${kind}`}>{t.labels.signalKind[kind]}</span>
              <div className="signal-title">{signal.headline}</div>
              <div className="signal-meta">
                <span>{signal.eventDate?.slice(5) ?? signal.detectedAt.slice(5, 10)}</span>
                <span className="strength" title={t.workbench.signals.strengthTitle(strength)}>
                  <span className="bar">
                    <i style={{ width: `${strength}%` }} />
                  </span>
                  {strength}
                </span>
              </div>
              {source && !isLikelyHomepageUrl(source.url) ? (
                <a
                  className="signal-source"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  title={t.workbench.signals.sourceTitle(source.url)}
                >
                  ↗ {source.publisher ?? t.workbench.signals.viewSource}
                </a>
              ) : source ? (
                <span className="signal-source disabled" title={t.workbench.signals.sourceUnavailableTitle}>
                  ↗ {t.workbench.signals.sourceUnavailable}
                </span>
              ) : null}
              {hasBrief ? (
                <button type="button" className="gen-brief has" onClick={() => onOpenBrief(signal.id)}>
                  {t.workbench.signals.viewBrief}
                </button>
              ) : isDuplicate ? (
                <button type="button" className="gen-brief" disabled>
                  {t.workbench.signals.skipped}
                </button>
              ) : generatingIds?.has(signal.id) ? (
                <button type="button" className="gen-brief gen" disabled>
                  {t.workbench.signals.generating}
                </button>
              ) : (
                <button type="button" className="gen-brief gen" onClick={() => onGenerate(signal.id)}>
                  {t.workbench.signals.genBrief}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
