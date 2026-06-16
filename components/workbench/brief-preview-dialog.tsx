"use client";

import type { ReactNode } from "react";
import type { EditorialBrief } from "@/lib/domain/types";
import { buildMapBriefPreview } from "@/lib/workflow/map-brief-preview";
import { useCopy } from "@/lib/i18n/locale-context";

/**
 * 简报详情弹窗 · 地图模式与首页编辑简报卡片共用。
 * header / close / body 共享，footer 由调用方通过 `footer` 注入。
 */
export function BriefPreviewDialog({
  brief,
  footer,
  onClose,
}: {
  brief: EditorialBrief;
  footer: ReactNode;
  onClose: () => void;
}) {
  const d = useCopy().dialogs.briefPreview;
  const preview = buildMapBriefPreview(brief);

  return (
    <div className="mbp-backdrop" onClick={onClose}>
      <section
        className="mbp-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brief-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mbp-head">
          <div>
            <div className="mbp-kicker">{d.kicker}</div>
            <h3 id="brief-preview-title" className="mbp-title">
              {preview.title}
            </h3>
            {preview.tagline ? <div className="mbp-tagline">{preview.tagline}</div> : null}
          </div>
          <button type="button" className="mbp-close" onClick={onClose} aria-label={d.close}>
            ×
          </button>
        </header>

        <div className="mbp-body">
          <section className="mbp-block">
            <div className="mbp-label">{d.blockFacts}</div>
            <ul className="mbp-facts">
              {preview.facts.map((fact, index) => (
                <li key={index}>{fact}</li>
              ))}
            </ul>
          </section>
          <section className="mbp-block">
            <div className="mbp-label">{d.blockWhy}</div>
            <p>{preview.whyItMatters}</p>
          </section>
          <section className="mbp-block accent">
            <div className="mbp-label">{d.blockMap}</div>
            <p>{preview.mapContext}</p>
          </section>
          <section className="mbp-block">
            <div className="mbp-label">{d.blockSources}</div>
            <p>{preview.sourceSummary}</p>
          </section>
          <div className="mbp-grid">
            <section className="mbp-block compact">
              <div className="mbp-label">{d.blockAngles}</div>
              <ul>
                {preview.possibleAngles.slice(0, 3).map((angle) => (
                  <li key={angle}>{angle}</li>
                ))}
              </ul>
            </section>
            <section className="mbp-block compact">
              <div className="mbp-label">{d.blockQuestions}</div>
              <ul>
                {preview.openQuestions.slice(0, 3).map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <footer className="mbp-foot">{footer}</footer>
      </section>
    </div>
  );
}
