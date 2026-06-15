"use client";

import type { Source } from "@/lib/domain/types";
import { EmptyMini } from "@/components/workbench/empty-state";
import { sourceKindMeta } from "@/components/workbench/helpers";

export function SourcePanel({ sources, briefTitle }: { sources: Source[]; briefTitle?: string }) {
  if (sources.length === 0) {
    return (
      <EmptyMini
        glyph="📚"
        title="未选择简报"
        sub="点击中间的某条简报，这里会列出它关联的来源、可信度和原始链接。"
      />
    );
  }

  return (
    <div>
      {briefTitle ? <div className="rail-title">关联简报：{briefTitle}</div> : null}
      {sources.map((source) => {
        const credibility = Math.round(source.confidence * 100);
        const barClass = credibility >= 85 ? "hi" : credibility >= 70 ? "mid" : "low";
        const kind = sourceKindMeta(source.sourceType);

        return (
          <div key={source.id} className="source-card">
            <div className="source-head">
              <span className="pub">{source.publisher ?? "未知发布方"}</span>
              <span className={`source-kind ${kind.className}`}>{kind.label}</span>
            </div>
            <div className="source-title">{source.title}</div>
            <div className="source-credibility">
              <span className="cbar">
                <i className={barClass} style={{ width: `${credibility}%` }} />
              </span>
              <span>{credibility}% 可信</span>
            </div>
            <a className="source-url" href={source.url} target="_blank" rel="noreferrer">
              {source.url}
            </a>
          </div>
        );
      })}
    </div>
  );
}
