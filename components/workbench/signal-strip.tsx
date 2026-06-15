"use client";

import type { CandidateSignal } from "@/lib/domain/types";
import { EmptyState } from "@/components/workbench/empty-state";
import { KIND_LABELS, signalKind } from "@/components/workbench/helpers";
import { SectionHint } from "@/components/workbench/section-hint";

interface SignalStripProps {
  signals: CandidateSignal[];
  briefBySignalId: Record<string, string>;
  /** 每条信号的原始出处链接（首个来源），用于跳转到对应新闻 */
  sourceById: Record<string, { url: string; publisher: string | null }>;
  onGenerate: (signalId: string) => void;
  onOpenBrief: (signalId: string) => void;
}

export function SignalStrip({ signals, briefBySignalId, sourceById, onGenerate, onOpenBrief }: SignalStripProps) {
  if (signals.length === 0) {
    return (
      <div className="signals-section">
        <EmptyState
          flush
          glyph="🛰"
          title="本次搜索未发现新信号"
          sub="这通常意味着对象近期较平静。可以稍后再试，或选择其他追踪对象。"
        />
      </div>
    );
  }

  return (
    <div className="signals-section">
      <div className="section-head inline">
        <span className="kicker">候选信号</span>
        <SectionHint label="SIGNALS" description="由搜索结果识别的重要变化" />
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
              <span className={`signal-kind ${kind}`}>{KIND_LABELS[kind]}</span>
              <div className="signal-title">{signal.headline}</div>
              <div className="signal-meta">
                <span>{signal.eventDate?.slice(5) ?? signal.detectedAt.slice(5, 10)}</span>
                <span className="strength" title={`强度 ${strength}`}>
                  <span className="bar">
                    <i style={{ width: `${strength}%` }} />
                  </span>
                  {strength}
                </span>
              </div>
              {source ? (
                <a
                  className="signal-source"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`原文出处：${source.url}`}
                >
                  ↗ {source.publisher ?? "查看原文"}
                </a>
              ) : null}
              {hasBrief ? (
                <button type="button" className="gen-brief has" onClick={() => onOpenBrief(signal.id)}>
                  查看已生成简报
                </button>
              ) : isDuplicate ? (
                <button type="button" className="gen-brief" disabled>
                  已跳过
                </button>
              ) : (
                <button type="button" className="gen-brief gen" onClick={() => onGenerate(signal.id)}>
                  生成简报
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
