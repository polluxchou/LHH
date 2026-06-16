"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/workbench/empty-state";
import { TrackedList } from "@/components/workbench/tracked-list";
import { SearchRunner, type RunnerViewModel } from "@/components/workbench/search-runner";
import { SignalStrip } from "@/components/workbench/signal-strip";
import { BriefingsSection, type BriefFilter } from "@/components/workbench/briefings-section";
import { SourcePanel } from "@/components/workbench/source-panel";
import { MapPanel } from "@/components/workbench/map-panel";
import { TopicPoolPanel, type StudioAdvanceKind } from "@/components/workbench/topic-pool-panel";
import { ProductionStudio, type StudioTab } from "@/components/workbench/production-studio";
import { ObserveDialog } from "@/components/workbench/observe-dialog";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import {
  buildBriefViewModel,
  buildPoolItems,
  getBriefIdBySignal,
  getSignalCounts,
} from "@/components/workbench/selectors";
import { BRIEF_STATUS_ORDER, compositeScoreFor, formatDateTimeShort } from "@/components/workbench/helpers";

export function Workbench() {
  const store = useWorkflow();
  const { state } = store;
  const [briefFilter, setBriefFilter] = useState<BriefFilter>("all");
  const [studio, setStudio] = useState<{ topicCardId: string; tab: StudioTab } | null>(null);
  const [trackedCollapsed, setTrackedCollapsed] = useState(false);
  const [observeBriefId, setObserveBriefId] = useState<string | null>(null);

  const visibleTracked = useMemo(() => {
    if (store.scope === "team") {
      return state.trackingObjects;
    }

    return state.trackingObjects.filter((object) => store.currentMember.trackingObjectIds.includes(object.id));
  }, [state.trackingObjects, store.scope, store.currentMember]);

  const activeTracked =
    state.trackingObjects.find((object) => object.id === state.selectedTrackingObjectId) ?? null;

  const signalCounts = useMemo(() => getSignalCounts(state), [state]);
  const briefBySignalId = useMemo(() => getBriefIdBySignal(state), [state]);

  const activeSignals = useMemo(
    () => state.candidateSignals.filter((signal) => signal.trackingObjectId === state.selectedTrackingObjectId),
    [state.candidateSignals, state.selectedTrackingObjectId],
  );
  const latestRun = useMemo(
    () =>
      [...state.searchRuns].reverse().find((run) => run.trackingObjectId === state.selectedTrackingObjectId) ?? null,
    [state.searchRuns, state.selectedTrackingObjectId],
  );
  const isRunning = activeTracked ? store.runningIds.has(activeTracked.id) : false;
  const runner: RunnerViewModel = {
    state: isRunning ? "run" : !latestRun ? "idle" : latestRun.status === "failed" ? "err" : "ok",
    queries: latestRun?.querySet.length ?? 0,
    hits: latestRun?.resultCount ?? 0,
    signals: activeSignals.length,
    dedup: activeSignals.filter((signal) => signal.noveltyStatus === "duplicate").length,
    lastRun: latestRun?.completedAt ? formatDateTimeShort(latestRun.completedAt) : "未运行",
    failReason: latestRun?.errorSummary ?? "",
  };

  const objectBriefVMs = useMemo(
    () =>
      state.editorialBriefs
        .filter((brief) => brief.trackingObjectId === state.selectedTrackingObjectId)
        .map((brief) => buildBriefViewModel(state, brief)),
    [state],
  );

  const briefCounts = useMemo<Record<BriefFilter, number>>(
    () => ({
      all: objectBriefVMs.length,
      pending: objectBriefVMs.filter((item) => item.uiStatus === "pending").length,
      pool: objectBriefVMs.filter((item) => item.uiStatus === "pool").length,
      watch: objectBriefVMs.filter((item) => item.uiStatus === "watch").length,
      rejected: objectBriefVMs.filter((item) => item.uiStatus === "rejected").length,
    }),
    [objectBriefVMs],
  );

  const visibleBriefVMs = useMemo(() => {
    const filtered =
      briefFilter === "all" ? objectBriefVMs : objectBriefVMs.filter((item) => item.uiStatus === briefFilter);

    return [...filtered].sort(
      (a, b) => BRIEF_STATUS_ORDER[a.uiStatus] - BRIEF_STATUS_ORDER[b.uiStatus] || b.score - a.score,
    );
  }, [objectBriefVMs, briefFilter]);

  const selectedBrief = state.editorialBriefs.find((brief) => brief.id === state.activeBriefId) ?? null;
  const selectedSignal = selectedBrief
    ? state.candidateSignals.find((signal) => signal.id === selectedBrief.candidateSignalId)
    : null;
  const selectedSources = useMemo(
    () => (selectedSignal ? state.sources.filter((source) => selectedSignal.sourceIds.includes(source.id)) : []),
    [state.sources, selectedSignal],
  );
  const selectedLocations = useMemo(
    () =>
      selectedBrief
        ? state.locationAnchors.filter((location) => selectedBrief.locationAnchorIds.includes(location.id))
        : [],
    [state.locationAnchors, selectedBrief],
  );

  const poolItems = useMemo(() => buildPoolItems(state), [state]);

  // 每条候选信号的原始出处 = 它第一个有效来源的链接
  const signalSourceById = useMemo(() => {
    const sourcesById = new Map(state.sources.map((source) => [source.id, source]));
    const out: Record<string, { url: string; publisher: string | null }> = {};
    for (const signal of state.candidateSignals) {
      const primary = signal.sourceIds.map((id) => sourcesById.get(id)).find(Boolean);
      if (primary) {
        out[signal.id] = { url: primary.url, publisher: primary.publisher };
      }
    }
    return out;
  }, [state.sources, state.candidateSignals]);

  const handleAdvance = (topicCardId: string, kind: StudioAdvanceKind) => {
    const labels: Record<StudioAdvanceKind, string> = { script: "脚本", storyboard: "分镜", video: "视频任务" };
    const topicCard = state.topicCards.find((item) => item.id === topicCardId);

    if (!topicCard) {
      return;
    }

    store.ensureProduction(topicCard.sourceEditorialBriefId);
    store.logDemo("info", `打开${labels[kind]}工作台 · ${topicCard.workingTitle}`, topicCard.sourceEditorialBriefId);
    setStudio({ topicCardId, tab: kind === "video" ? "task" : kind });
  };

  const studioContext = useMemo(() => {
    if (!studio) {
      return null;
    }

    const topicCard = state.topicCards.find((item) => item.id === studio.topicCardId);

    if (!topicCard) {
      return null;
    }

    const brief = state.editorialBriefs.find((item) => item.id === topicCard.sourceEditorialBriefId);
    const production = brief ? state.productionDrafts[brief.id] : null;

    if (!brief || !production) {
      return null;
    }

    return {
      topicCard,
      brief,
      production,
      score: compositeScoreFor(brief.id, state.contentValueScores),
    };
  }, [studio, state]);

  return (
    <>
      <div className={`workbench ${trackedCollapsed ? "tracked-collapsed" : ""}`}>
        <TrackedList
          items={visibleTracked}
          allItems={state.trackingObjects}
          activeId={state.selectedTrackingObjectId}
          scope={store.scope}
          currentMember={store.currentMember}
          members={state.teamMembers}
          signalCounts={signalCounts}
          collapsed={trackedCollapsed}
          onPick={store.pickTracked}
          onCollapsedChange={setTrackedCollapsed}
          onScopeChange={store.setScope}
          onSubToggle={store.subToggle}
          onAdd={() => store.setAddOpen(true)}
        />

        <div className="col col-mid">
          {activeTracked ? (
            <>
              <SearchRunner
                tracked={activeTracked}
                runner={runner}
                onRun={() => store.startSearch(false)}
                onDemoAction={(message) => store.logDemo("info", message)}
              />

              {runner.state === "err" ? (
                <EmptyState
                  glyph="🛰"
                  title="搜索失败 · 暂无信号可供筛选"
                  sub="上方的搜索运行区已展示错误详情。可重试，或先切换到其他追踪对象继续工作。"
                />
              ) : runner.state === "run" ? (
                <EmptyState
                  glyph="⏳"
                  title="正在搜索 · 通常需要 30 秒"
                  sub="系统正在向 19 个来源池发起查询，去重并识别候选信号。你可以先离开，完成后会刷新这一区域。"
                />
              ) : (
                <SignalStrip
                  signals={activeSignals}
                  briefBySignalId={briefBySignalId}
                  sourceById={signalSourceById}
                  onGenerate={store.generateBrief}
                  onOpenBrief={store.openBriefFromSignal}
                />
              )}

              <BriefingsSection
                items={visibleBriefVMs}
                counts={briefCounts}
                filter={briefFilter}
                selectedId={state.activeBriefId}
                expandedIds={store.expandedBriefIds}
                cardStyle={store.tweaks.briefStyle}
                onFilterChange={setBriefFilter}
                onSelect={store.selectBrief}
                onToggleExpand={store.toggleExpand}
                onDecide={store.decide}
                onObserve={(briefId) => setObserveBriefId(briefId)}
              />
            </>
          ) : (
            <EmptyState
              glyph="📡"
              title="还没有可见的追踪对象"
              sub="切换到「团队全部」订阅一个对象，或点击左下角「新增追踪对象」。"
            />
          )}
        </div>

        <div className="col col-right">
          <div className="right-tabs">
            <button
              type="button"
              className={`right-tab ${store.rightTab === "sources" || store.rightTab === "map" ? "active" : ""}`}
              onClick={() => store.setRightTab(store.rightTab === "map" ? "map" : "sources")}
            >
              信源 <span className="n">{selectedSources.length + selectedLocations.length}</span>
            </button>
            <button
              type="button"
              className={`right-tab ${store.rightTab === "pool" ? "active" : ""}`}
              onClick={() => store.setRightTab("pool")}
            >
              选题库 <span className="n">{poolItems.length}</span>
            </button>
          </div>
          <div className="right-content">
            {store.rightTab === "sources" || store.rightTab === "map" ? (
              <>
                <div className="right-subtabs">
                  <button
                    type="button"
                    className={`right-subtab ${store.rightTab === "sources" ? "active" : ""}`}
                    onClick={() => store.setRightTab("sources")}
                  >
                    链接 <span className="n">{selectedSources.length}</span>
                  </button>
                  <button
                    type="button"
                    className={`right-subtab ${store.rightTab === "map" ? "active" : ""}`}
                    onClick={() => store.setRightTab("map")}
                  >
                    发生地 <span className="n">{selectedLocations.length}</span>
                  </button>
                </div>
                {store.rightTab === "sources" ? (
                  <SourcePanel sources={selectedSources} briefTitle={selectedBrief?.briefTitle} />
                ) : (
                  <MapPanel locations={selectedLocations} briefTitle={selectedBrief?.briefTitle} />
                )}
              </>
            ) : null}
            {store.rightTab === "pool" ? (
              <TopicPoolPanel
                items={poolItems}
                currentMember={store.currentMember}
                onClaim={store.claim}
                onAdvance={handleAdvance}
              />
            ) : null}
          </div>
        </div>
      </div>

      {studio && studioContext ? (
        <ProductionStudio
          brief={studioContext.brief}
          topicCard={studioContext.topicCard}
          production={studioContext.production}
          score={studioContext.score}
          initialTab={studio.tab}
          onClose={() => setStudio(null)}
          onLog={(level, message) => store.logDemo(level === "success" ? "success" : level, message)}
          onEditSection={(sectionId, body) => store.editScriptSection(studioContext.brief.id, sectionId, body)}
          onEditShot={(shotNumber, patch) => store.editStoryboardShot(studioContext.brief.id, shotNumber, patch)}
          onToggleCheck={(itemId) => store.toggleCheck(studioContext.brief.id, itemId)}
          onReset={() => store.resetProduction(studioContext.brief.id)}
          onGenerate={(targetDuration) => store.generateProduction(studioContext.brief.id, targetDuration)}
        />
      ) : null}

      <ObserveDialog
        open={observeBriefId !== null}
        briefTitle={state.editorialBriefs.find((brief) => brief.id === observeBriefId)?.briefTitle}
        onClose={() => setObserveBriefId(null)}
        onConfirm={(dimensions) => {
          if (observeBriefId) {
            store.observeWithDimensions(observeBriefId, dimensions);
          }
        }}
      />
    </>
  );
}
