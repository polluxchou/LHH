"use client";

import { useState } from "react";
import { moveItem } from "@/lib/workflow/reorder";
import type { TeamMember, TrackingObject } from "@/lib/domain/types";
import { getTrackedAbbreviation, getTrackedCountRatio, getTrackedRailLabel } from "@/lib/workflow/tracked-counts";
import { priorityClass } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

export type TrackedScope = "mine" | "team";

interface TrackedListProps {
  items: TrackingObject[];
  allItems: TrackingObject[];
  activeId: string;
  scope: TrackedScope;
  currentMember: TeamMember;
  members: TeamMember[];
  signalCounts: Record<string, number>;
  collapsed: boolean;
  onPick: (trackingObjectId: string) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onScopeChange: (scope: TrackedScope) => void;
  onSubToggle: (trackingObjectId: string) => void;
  /** 仅「我关注的」可用：拖拽得到新顺序 */
  onReorder: (orderedTrackingObjectIds: string[]) => void;
  onAdd: () => void;
}

export function TrackedList({
  items,
  allItems,
  activeId,
  scope,
  currentMember,
  members,
  signalCounts,
  collapsed,
  onPick,
  onCollapsedChange,
  onScopeChange,
  onSubToggle,
  onReorder,
  onAdd,
}: TrackedListProps) {
  const t = useCopy();
  const tk = t.workbench.tracked;
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const canReorder = scope === "mine" && !collapsed;

  const handleDrop = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    onReorder(moveItem(items.map((o) => o.id), dragIndex, toIndex));
    setDragIndex(null);
    setOverIndex(null);
  };
  const mineCount = allItems.filter((item) => currentMember.trackingObjectIds.includes(item.id)).length;
  const trackedCountRatio = getTrackedCountRatio(allItems, currentMember);
  const railLabel = getTrackedRailLabel(allItems, currentMember);

  if (collapsed) {
    return (
      <aside className="col col-left tracked-rail" aria-label={railLabel}>
        <button
          type="button"
          className="tracked-rail-expand"
          onClick={() => onCollapsedChange(false)}
          title={tk.expandTitle}
          aria-label={tk.expandTitle}
        >
          ‹
        </button>
        <div className="tracked-rail-list" aria-label={railLabel}>
          {items.map((item) => {
            const label = item.nameZh ?? item.name;

            return (
              <button
                key={item.id}
                type="button"
                className={`tracked-rail-dot prio-${priorityClass(item.priority)} ${item.id === activeId ? "active" : ""}`}
                onClick={() => onPick(item.id)}
                title={label}
                aria-label={tk.switchTo(label)}
              >
                {getTrackedAbbreviation(item)}
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <div className="col col-left">
      <div className="section-head">
        <span className="kicker">{tk.kicker}</span>
        <span className="sub">{trackedCountRatio}</span>
        <button
          type="button"
          className="tracked-collapse-btn"
          onClick={() => onCollapsedChange(true)}
          aria-label={tk.collapseTitle}
          title={tk.collapseTitle}
        >
          ‹
        </button>
      </div>
      <div className="scope-toggle">
        <button type="button" className={`scope-btn ${scope === "mine" ? "active" : ""}`} onClick={() => onScopeChange("mine")}>
          {tk.scopeMine} <span className="n">{mineCount}</span>
        </button>
        <button type="button" className={`scope-btn ${scope === "team" ? "active" : ""}`} onClick={() => onScopeChange("team")}>
          {tk.scopeTeam} <span className="n">{allItems.length}</span>
        </button>
      </div>
      <div className="tracked-list">
        {items.map((item, index) => {
          const subscribers = members.filter((member) => member.trackingObjectIds.includes(item.id));
          const isSubscribed = currentMember.trackingObjectIds.includes(item.id);
          const signalCount = signalCounts[item.id] ?? 0;

          return (
            <button
              key={item.id}
              type="button"
              className={`tracked-item prio-${priorityClass(item.priority)} ${item.id === activeId ? "active" : ""} ${
                !isSubscribed && scope === "team" ? "not-mine" : ""
              } ${canReorder ? "draggable" : ""} ${dragIndex === index ? "dragging" : ""} ${
                canReorder && overIndex === index && dragIndex !== index ? "drag-over" : ""
              }`}
              draggable={canReorder}
              onDragStart={canReorder ? () => setDragIndex(index) : undefined}
              onDragOver={canReorder ? (e) => { e.preventDefault(); setOverIndex(index); } : undefined}
              onDrop={canReorder ? (e) => { e.preventDefault(); handleDrop(index); } : undefined}
              onDragEnd={canReorder ? () => { setDragIndex(null); setOverIndex(null); } : undefined}
              onClick={() => onPick(item.id)}
            >
              <span className="tdot"></span>
              <span className="tname">{item.nameZh ?? item.name}</span>
              <span className={`tcount ${signalCount === 0 ? "zero" : ""}`}>{signalCount}</span>
              <span className="tmeta">
                {item.primaryTrack} · {tk.updatedPrefix} {item.updatedAt.slice(5, 10)}
              </span>
              {scope === "team" ? (
                <span className="tsubs" title={subscribers.map((member) => member.name).join(" · ")}>
                  {subscribers.slice(0, 3).map((member) => (
                    <span key={member.id} className="tsub-avatar" style={{ background: member.color }}>
                      {member.avatarChar}
                    </span>
                  ))}
                  {subscribers.length > 3 ? <span className="tsub-more">+{subscribers.length - 3}</span> : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className={`tracked-subbtn ${isSubscribed ? "subbed" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSubToggle(item.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        onSubToggle(item.id);
                      }
                    }}
                  >
                    {isSubscribed ? tk.subscribed : tk.subscribe}
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
        <button type="button" className="tracked-list-add" onClick={onAdd}>
          {tk.addObject}
        </button>
      </div>
    </div>
  );
}
