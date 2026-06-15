"use client";

import type { TeamMember, TopicCard } from "@/lib/domain/types";
import { EmptyMini } from "@/components/workbench/empty-state";
import { formatDateShort, topicFormatLabel } from "@/components/workbench/helpers";

export type StudioAdvanceKind = "script" | "storyboard" | "video";

export interface PoolItemViewModel {
  topicCard: TopicCard;
  score: number;
  createdAt: string;
  addedBy?: TeamMember;
  owner?: TeamMember;
}

interface TopicPoolPanelProps {
  items: PoolItemViewModel[];
  currentMember: TeamMember;
  onClaim: (topicCardId: string) => void;
  onAdvance: (topicCardId: string, kind: StudioAdvanceKind) => void;
}

export function TopicPoolPanel({ items, currentMember, onClaim, onAdvance }: TopicPoolPanelProps) {
  if (items.length === 0) {
    return (
      <EmptyMini glyph="📦" title="选题库为空" sub="通过的简报会进入这里。从这里继续产出脚本、分镜、配音稿、视频任务。" />
    );
  }

  return (
    <div>
      <div className="rail-title split">
        <span>团队共享 · {items.length} 条</span>
        <span className="aux">全员可见</span>
      </div>
      {items.map(({ topicCard, score, createdAt, addedBy, owner }) => {
        const isMine = owner?.id === currentMember.id;

        return (
          <div key={topicCard.id} className="pool-item">
            <div className="pheadline">{topicCard.workingTitle}</div>
            <div className="pq">核心问题 · {topicCard.coreQuestion}</div>
            {topicCard.observationDimensions && topicCard.observationDimensions.length > 0 ? (
              <div className="pobserve">
                <span className="pobserve-label">观察维度</span>
                <ul className="observe-dims">
                  {topicCard.observationDimensions.map((dimension, index) => (
                    <li key={index}>{dimension}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="pmeta">
              <span className="ptag">{topicFormatLabel(topicCard)}</span>
              <span>价值 {score}</span>
              <span>· {formatDateShort(createdAt)}</span>
            </div>
            <div className="powner">
              {addedBy ? (
                <span className="powner-added" title={`由 ${addedBy.name} 加入`}>
                  <span className="pavatar" style={{ background: addedBy.color }}>
                    {addedBy.avatarChar}
                  </span>
                  <span className="powner-text">{addedBy.name} 加入</span>
                </span>
              ) : null}
              {owner ? (
                <span className={`powner-owner ${isMine ? "mine" : ""}`} title={`${owner.name} 负责`}>
                  <span className="pavatar" style={{ background: owner.color }}>
                    {owner.avatarChar}
                  </span>
                  <span className="powner-text">
                    {owner.name} 负责{isMine ? "（你）" : ""}
                  </span>
                </span>
              ) : (
                <button type="button" className="powner-claim" onClick={() => onClaim(topicCard.id)}>
                  + 我来认领
                </button>
              )}
            </div>
            <div className="pactions">
              <button type="button" className="pact-btn" onClick={() => onAdvance(topicCard.id, "script")}>
                生成脚本
              </button>
              <button type="button" className="pact-btn" onClick={() => onAdvance(topicCard.id, "storyboard")}>
                分镜
              </button>
              <button type="button" className="pact-btn" onClick={() => onAdvance(topicCard.id, "video")}>
                视频任务
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
