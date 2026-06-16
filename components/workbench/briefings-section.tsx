"use client";

import { useState } from "react";
import type { EditorialBrief } from "@/lib/domain/types";
import { BriefPreviewDialog } from "@/components/workbench/brief-preview-dialog";
import { EmptyState } from "@/components/workbench/empty-state";
import { SectionHint } from "@/components/workbench/section-hint";
import { formatDateTimeShort, type BriefUiStatus, type SignalKind } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

export type BriefStyle = "card" | "table" | "timeline";
export type BriefFilter = "all" | BriefUiStatus;

export interface BriefViewModel {
  brief: EditorialBrief;
  uiStatus: BriefUiStatus;
  score: number;
  kind: SignalKind;
  sourceCount: number;
  locationCount: number;
  rejectReason?: string;
  poolTitle?: string;
  /** 「持续观察」时记录的观察维度，回显在展开区 */
  observationDimensions?: string[];
}

interface BriefingsSectionProps {
  items: BriefViewModel[];
  counts: Record<BriefFilter, number>;
  filter: BriefFilter;
  selectedId: string | null;
  expandedIds: ReadonlySet<string>;
  cardStyle: BriefStyle;
  onFilterChange: (filter: BriefFilter) => void;
  onSelect: (briefId: string) => void;
  onToggleExpand: (briefId: string) => void;
  onDecide: (briefId: string, decision: Exclude<BriefUiStatus, "pending">) => void;
  /** 点击「观察」时触发，打开观察维度弹窗 */
  onObserve: (briefId: string) => void;
}

export function BriefingsSection({
  items,
  counts,
  filter,
  selectedId,
  expandedIds,
  cardStyle,
  onFilterChange,
  onSelect,
  onToggleExpand,
  onDecide,
  onObserve,
}: BriefingsSectionProps) {
  const t = useCopy();
  const b = t.workbench.briefings;
  const filters: Array<{ id: BriefFilter; label: string }> = [
    { id: "all", label: b.filterAll },
    { id: "pending", label: b.filterPending },
    { id: "pool", label: b.filterPool },
    { id: "watch", label: b.filterWatch },
    { id: "rejected", label: b.filterRejected },
  ];

  return (
    <div className="briefings-section">
      <div className="section-head inline">
        <span className="kicker">{b.sectionTitle}</span>
        <SectionHint label="BRIEFINGS" description={b.hint} />
        <span className="count">{counts.all}</span>
      </div>
      <div className="brief-filters">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`brief-filter ${filter === item.id ? "active" : ""}`}
            onClick={() => onFilterChange(item.id)}
          >
            {item.label}
            <span className="n">{counts[item.id]}</span>
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState flush glyph="📑" title={b.emptyTitle} sub={b.emptySub} />
      ) : (
        <div className={`briefings-grid style-${cardStyle}`}>
          {items.map((item) => (
            <BriefingCard
              key={item.brief.id}
              item={item}
              isSelected={item.brief.id === selectedId}
              isExpanded={expandedIds.has(item.brief.id) && cardStyle !== "table"}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onDecide={onDecide}
              onObserve={onObserve}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BriefingCard({
  item,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
  onDecide,
  onObserve,
}: {
  item: BriefViewModel;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: (briefId: string) => void;
  onToggleExpand: (briefId: string) => void;
  onDecide: (briefId: string, decision: Exclude<BriefUiStatus, "pending">) => void;
  onObserve: (briefId: string) => void;
}) {
  const t = useCopy();
  const b = t.workbench.briefings;
  const { brief, uiStatus, score, kind, sourceCount, locationCount, rejectReason, poolTitle, observationDimensions } =
    item;
  const decided = uiStatus !== "pending";
  const facts = brief.factBullets ?? [brief.factSummary];
  const [showPreview, setShowPreview] = useState(false);

  return (
    <article
      className={`brief-card status-${uiStatus} ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(brief.id)}
    >
      {decided ? <span className={`brief-status s-${uiStatus}`}>{t.labels.briefStatus[uiStatus]}</span> : null}
      <div className="brief-head">
        <div className={`brief-score ${score >= 85 ? "high" : ""}`}>
          <div className="n">{score}</div>
          <div className="l">{b.score}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            className="brief-headline"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(brief.id);
              onToggleExpand(brief.id);
            }}
            title={isExpanded ? b.collapseTitle : b.expandTitle}
          >
            {brief.briefTitle}
          </h3>
          {brief.tagline ? <div className="brief-tagline">{brief.tagline}</div> : null}
          <div className="brief-meta-row">
            <span className={`chip kind-${kind}`}>{t.labels.signalKind[kind]}</span>
            <span>{formatDateTimeShort(brief.createdAt)}</span>
            <span>· {b.sources(sourceCount)}</span>
            <span>· {b.locations(locationCount)}</span>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="brief-body" onClick={(event) => event.stopPropagation()}>
          <div>
            <div className="block-title">{b.blockFacts}</div>
            <ul className="facts">
              {facts.map((fact, index) => (
                <li key={index}>{fact}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="block-title">{b.blockWhy}</div>
            <div className="why">{brief.whyItMatters}</div>
          </div>
          {observationDimensions && observationDimensions.length > 0 ? (
            <div>
              <div className="block-title">{b.blockObserve}</div>
              <ul className="observe-dims">
                {observationDimensions.map((dimension, index) => (
                  <li key={index}>{dimension}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="brief-actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="brief-action" onClick={() => setShowPreview(true)}>
          ⤢ {b.detail}
        </button>
        <span className="spacer" />
        {uiStatus === "pending" ? (
          <>
            <button type="button" className="brief-action reject" onClick={() => onDecide(brief.id, "rejected")}>
              {b.reject}
            </button>
            <button type="button" className="brief-action watch" onClick={() => onObserve(brief.id)}>
              {b.watch}
            </button>
            <button type="button" className="brief-action pass" onClick={() => onDecide(brief.id, "pool")}>
              {b.pass}
            </button>
          </>
        ) : uiStatus === "rejected" ? (
          <div className="brief-decided">
            <span>
              {b.decidedRejected}
              {rejectReason ? ` · ${rejectReason}` : ""}
            </span>
          </div>
        ) : uiStatus === "pool" ? (
          <div className="brief-decided pool">
            <span>
              {b.decidedPoolPrefix}
              {poolTitle ?? brief.briefTitle}
            </span>
          </div>
        ) : (
          <div className="brief-decided">
            <span>
              {b.watchingActive}
              {observationDimensions && observationDimensions.length > 0
                ? ` · ${b.watchingDims(observationDimensions.length)}`
                : ` · ${b.watchingWaiting}`}
            </span>
          </div>
        )}
      </div>

      {showPreview ? (
        <div onClick={(event) => event.stopPropagation()}>
          <BriefPreviewDialog
            brief={brief}
            onClose={() => setShowPreview(false)}
            footer={
              uiStatus === "pending" ? (
                <>
                  <button
                    type="button"
                    className="brief-action reject"
                    onClick={() => {
                      onDecide(brief.id, "rejected");
                      setShowPreview(false);
                    }}
                  >
                    {b.reject}
                  </button>
                  <button
                    type="button"
                    className="brief-action watch"
                    onClick={() => {
                      onObserve(brief.id);
                      setShowPreview(false);
                    }}
                  >
                    {b.watch}
                  </button>
                  <button
                    type="button"
                    className="brief-action pass"
                    onClick={() => {
                      onDecide(brief.id, "pool");
                      setShowPreview(false);
                    }}
                  >
                    {b.pass}
                  </button>
                  <span className="spacer" />
                  <button type="button" className="mbp-btn" onClick={() => setShowPreview(false)}>
                    {b.close}
                  </button>
                </>
              ) : (
                <>
                  <span className="mbp-foot-status">{t.labels.briefStatus[uiStatus]}</span>
                  <span className="spacer" />
                  <button type="button" className="mbp-btn" onClick={() => setShowPreview(false)}>
                    {b.close}
                  </button>
                </>
              )
            }
          />
        </div>
      ) : null}
    </article>
  );
}
