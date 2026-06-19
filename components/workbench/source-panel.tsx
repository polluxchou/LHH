"use client";

import type { Source } from "@/lib/domain/types";
import { EmptyMini } from "@/components/workbench/empty-state";
import { sourceKindMeta } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

export function SourcePanel({ sources, briefTitle }: { sources: Source[]; briefTitle?: string }) {
  const t = useCopy();

  if (sources.length === 0) {
    return <EmptyMini glyph="📚" title={t.workbench.sourcePanel.emptyTitle} sub={t.workbench.sourcePanel.emptySub} />;
  }

  return (
    <div>
      {briefTitle ? <div className="rail-title">{t.workbench.relatedBrief(briefTitle)}</div> : null}
      {sources.map((source) => {
        const credibility = Math.round(source.confidence * 100);
        const barClass = credibility >= 85 ? "hi" : credibility >= 70 ? "mid" : "low";
        const kind = sourceKindMeta(source.sourceType);

        return (
          <div key={source.id} className="source-card">
            <div className="source-head">
              <span className="pub">{source.publisher ?? t.workbench.sourcePanel.unknownPublisher}</span>
              <span className={`source-kind ${kind.className}`}>{t.labels.sourceKind[kind.key]}</span>
            </div>
            <div className="source-title">
              {source.url ? (
                <a
                  className="source-title-link"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  title={t.workbench.signals.viewSource}
                >
                  {source.title}
                  <span className="source-link-ic" aria-hidden="true">↗</span>
                </a>
              ) : (
                source.title
              )}
            </div>
            <div className="source-credibility">
              <span className="cbar">
                <i className={barClass} style={{ width: `${credibility}%` }} />
              </span>
              <span>{t.workbench.sourcePanel.credible(credibility)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
