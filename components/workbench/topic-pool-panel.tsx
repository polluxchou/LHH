"use client";

import type { TeamMember, TopicCard } from "@/lib/domain/types";
import { EmptyMini } from "@/components/workbench/empty-state";
import { formatDateShort, topicFormatLabel } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

export type StudioAdvanceKind = "script" | "storyboard" | "video";

export interface PoolItemViewModel {
  topicCard: TopicCard;
  score: number;
  createdAt: string;
  /** 入选题库时间（决策 decidedAt）；用于「最新入库置顶」排序 */
  decidedAt: string;
  addedBy?: TeamMember;
  owner?: TeamMember;
}

interface TopicPoolPanelProps {
  items: PoolItemViewModel[];
  currentMember: TeamMember;
  onClaim: (topicCardId: string) => void;
  onAdvance: (topicCardId: string, kind: StudioAdvanceKind) => void;
  /** 「生成文章」：图文方向，功能单独实现 */
  onGenerateArticle: (topicCardId: string) => void;
}

export function TopicPoolPanel({ items, currentMember, onClaim, onAdvance, onGenerateArticle }: TopicPoolPanelProps) {
  const t = useCopy();

  if (items.length === 0) {
    return <EmptyMini glyph="📦" title={t.workbench.pool.emptyTitle} sub={t.workbench.pool.emptySub} />;
  }

  return (
    <div>
      <div className="rail-title split">
        <span>{t.workbench.pool.shared(items.length)}</span>
        <span className="aux">{t.workbench.pool.allVisible}</span>
      </div>
      {items.map(({ topicCard, score, createdAt, addedBy, owner }) => {
        const isMine = owner?.id === currentMember.id;

        return (
          <div key={topicCard.id} className="pool-item">
            <div className="pheadline">{topicCard.workingTitle}</div>
            <div className="pq">{t.workbench.pool.coreQuestion(topicCard.coreQuestion)}</div>
            {topicCard.observationDimensions && topicCard.observationDimensions.length > 0 ? (
              <div className="pobserve">
                <span className="pobserve-label">{t.workbench.pool.observeLabel}</span>
                <ul className="observe-dims">
                  {topicCard.observationDimensions.map((dimension, index) => (
                    <li key={index}>{dimension}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="pmeta">
              <span className="ptag">{topicFormatLabel(topicCard, t.labels.format)}</span>
              <span>{t.workbench.pool.value(score)}</span>
              <span>· {formatDateShort(createdAt)}</span>
            </div>
            <div className="powner">
              {addedBy ? (
                <span className="powner-added" title={t.workbench.pool.addedByTitle(addedBy.name)}>
                  <span className="pavatar" style={{ background: addedBy.color }}>
                    {addedBy.avatarChar}
                  </span>
                  <span className="powner-text">{t.workbench.pool.addedByText(addedBy.name)}</span>
                </span>
              ) : null}
              {owner ? (
                <span className={`powner-owner ${isMine ? "mine" : ""}`} title={t.workbench.pool.ownerTitle(owner.name)}>
                  <span className="pavatar" style={{ background: owner.color }}>
                    {owner.avatarChar}
                  </span>
                  <span className="powner-text">
                    {t.workbench.pool.ownerText(owner.name)}
                    {isMine ? t.workbench.pool.mineSuffix : ""}
                  </span>
                </span>
              ) : (
                <button type="button" className="powner-claim" onClick={() => onClaim(topicCard.id)}>
                  {t.workbench.pool.claim}
                </button>
              )}
            </div>
            <div className="pactions">
              <button type="button" className="pact-btn" onClick={() => onAdvance(topicCard.id, "script")}>
                {t.workbench.pool.genVideo}
              </button>
              <button type="button" className="pact-btn" onClick={() => onGenerateArticle(topicCard.id)}>
                {t.workbench.pool.genArticle}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
