"use client";

import { useState } from "react";
import type { EditorialBrief } from "@/lib/domain/types";
import { BriefPreviewDialog } from "@/components/workbench/brief-preview-dialog";
import { EmptyState } from "@/components/workbench/empty-state";
import { SectionHint } from "@/components/workbench/section-hint";
import {
  BRIEF_STATUS_LABELS,
  KIND_LABELS,
  formatDateTimeShort,
  type BriefUiStatus,
  type SignalKind,
} from "@/components/workbench/helpers";

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

const FILTERS: Array<{ id: BriefFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "pending", label: "待筛" },
  { id: "pool", label: "已通过" },
  { id: "watch", label: "观察" },
  { id: "rejected", label: "已拒" },
];

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
  return (
    <div className="briefings-section">
      <div className="section-head inline">
        <span className="kicker">编辑简报</span>
        <SectionHint label="BRIEFINGS" description="事实 + 为什么重要 + 来源 · 由编辑筛选" />
        <span className="count">{counts.all}</span>
      </div>
      <div className="brief-filters">
        {FILTERS.map((item) => (
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
        <EmptyState
          flush
          glyph="📑"
          title="没有匹配的简报"
          sub="尝试切换筛选条件，或针对这个追踪对象重新运行搜索。"
        />
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
      {decided ? <span className={`brief-status s-${uiStatus}`}>{BRIEF_STATUS_LABELS[uiStatus]}</span> : null}
      <div className="brief-head">
        <div className={`brief-score ${score >= 85 ? "high" : ""}`}>
          <div className="n">{score}</div>
          <div className="l">价值</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            className="brief-headline"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(brief.id);
              onToggleExpand(brief.id);
            }}
            title={isExpanded ? "收起细节" : "展开细节"}
          >
            {brief.briefTitle}
          </h3>
          {brief.tagline ? <div className="brief-tagline">{brief.tagline}</div> : null}
          <div className="brief-meta-row">
            <span className={`chip kind-${kind}`}>{KIND_LABELS[kind]}</span>
            <span>{formatDateTimeShort(brief.createdAt)}</span>
            <span>· {sourceCount} 个来源</span>
            <span>· {locationCount} 个地点</span>
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div className="brief-body" onClick={(event) => event.stopPropagation()}>
          <div>
            <div className="block-title">事实摘要</div>
            <ul className="facts">
              {facts.map((fact, index) => (
                <li key={index}>{fact}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="block-title">为什么重要</div>
            <div className="why">{brief.whyItMatters}</div>
          </div>
          {observationDimensions && observationDimensions.length > 0 ? (
            <div>
              <div className="block-title">观察维度</div>
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
          ⤢ 详情
        </button>
        <span className="spacer" />
        {uiStatus === "pending" ? (
          <>
            <button type="button" className="brief-action reject" onClick={() => onDecide(brief.id, "rejected")}>
              拒绝
            </button>
            <button type="button" className="brief-action watch" onClick={() => onObserve(brief.id)}>
              观察
            </button>
            <button type="button" className="brief-action pass" onClick={() => onDecide(brief.id, "pool")}>
              通过 · 入选题库
            </button>
          </>
        ) : uiStatus === "rejected" ? (
          <div className="brief-decided">
            <span>已拒绝{rejectReason ? ` · ${rejectReason}` : ""}</span>
          </div>
        ) : uiStatus === "pool" ? (
          <div className="brief-decided pool">
            <span>已入选题库：{poolTitle ?? brief.briefTitle}</span>
          </div>
        ) : (
          <div className="brief-decided">
            <span>
              持续观察中
              {observationDimensions && observationDimensions.length > 0
                ? ` · ${observationDimensions.length} 个观察维度`
                : " · 等待下一轮信号变化"}
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
                    拒绝
                  </button>
                  <button
                    type="button"
                    className="brief-action watch"
                    onClick={() => {
                      onObserve(brief.id);
                      setShowPreview(false);
                    }}
                  >
                    观察
                  </button>
                  <button
                    type="button"
                    className="brief-action pass"
                    onClick={() => {
                      onDecide(brief.id, "pool");
                      setShowPreview(false);
                    }}
                  >
                    通过 · 入选题库
                  </button>
                  <span className="spacer" />
                  <button type="button" className="mbp-btn" onClick={() => setShowPreview(false)}>
                    关闭
                  </button>
                </>
              ) : (
                <>
                  <span className="mbp-foot-status">{BRIEF_STATUS_LABELS[uiStatus]}</span>
                  <span className="spacer" />
                  <button type="button" className="mbp-btn" onClick={() => setShowPreview(false)}>
                    关闭
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
