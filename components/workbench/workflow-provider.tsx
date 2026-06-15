"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TeamMember } from "@/lib/domain/types";
import {
  addTrackingObject,
  appendWorkflowLog,
  claimTopicCard,
  createInitialWorkflowState,
  ensureProductionDraft,
  generateBriefForSignal,
  resetProductionDraft,
  runFailedMockSearchForTrackingObject,
  runMockSearchForTrackingObject,
  screenBrief,
  selectTrackingObject,
  switchTeamMember,
  toggleProductionChecklistItem,
  toggleSubscription,
  updateScriptSection,
  updateStoryboardShot,
  type AddTrackingObjectInput,
  type LocalWorkflowState,
  type WorkflowRunLogEntry,
} from "@/lib/workflow/local-workflow";
import { buildTrackingObjectQueries } from "@/lib/search/query-builder";
import type { StoryboardShot } from "@/lib/domain/production";
import type { TrackedScope } from "@/components/workbench/tracked-list";
import type { BriefUiStatus } from "@/components/workbench/helpers";
import { useWorkbenchTweaks, type WorkbenchTweaks } from "@/components/workbench/tweaks-panel";

export type RightTab = "sources" | "map" | "pool";

const SIMULATED_FAILURE = "API 网关超时 · 3/18 来源返回错误";

const DECISION_INPUT: Record<
  Exclude<BriefUiStatus, "pending">,
  { decision: "approved" | "watch" | "rejected"; reason: string }
> = {
  pool: { decision: "approved", reason: "" },
  watch: { decision: "watch", reason: "等待下一轮信号变化" },
  rejected: { decision: "rejected", reason: "编辑判断价值不足" },
};

export interface WorkbenchStore {
  state: LocalWorkflowState;
  currentMember: TeamMember;
  scope: TrackedScope;
  setScope: (scope: TrackedScope) => void;
  rightTab: RightTab;
  setRightTab: (tab: RightTab) => void;
  expandedBriefIds: ReadonlySet<string>;
  toggleExpand: (briefId: string) => void;
  runningIds: ReadonlySet<string>;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  tweaks: WorkbenchTweaks;
  setTweak: (patch: Partial<WorkbenchTweaks>) => void;
  // ── actions ──
  pickTracked: (trackingObjectId: string) => void;
  startSearch: (fail: boolean) => void;
  generateBrief: (signalId: string) => void;
  openBriefFromSignal: (signalId: string) => void;
  selectBrief: (briefId: string) => void;
  decide: (briefId: string, decision: Exclude<BriefUiStatus, "pending">) => void;
  /** 「持续观察」：带多条观察维度，记为 watch 状态（不进入选题库） */
  observeWithDimensions: (briefId: string, dimensions: string[]) => void;
  claim: (topicCardId: string) => void;
  switchMember: (memberId: string) => void;
  subToggle: (trackingObjectId: string) => void;
  addTracked: (input: AddTrackingObjectInput) => void;
  logDemo: (level: WorkflowRunLogEntry["level"], message: string, briefId?: string) => void;
  /** select object + brief + expand + right tab — used by cross-page jumps */
  focusBrief: (briefId: string, tab?: RightTab) => void;
  // ── production drafts ──
  ensureProduction: (briefId: string) => void;
  editScriptSection: (briefId: string, sectionId: string, body: string) => void;
  editStoryboardShot: (briefId: string, shotNumber: number, patch: Partial<Omit<StoryboardShot, "n">>) => void;
  toggleCheck: (briefId: string, itemId: string) => void;
  resetProduction: (briefId: string) => void;
}

const WorkflowContext = createContext<WorkbenchStore | null>(null);

export function useWorkflow(): WorkbenchStore {
  const store = useContext(WorkflowContext);

  if (!store) {
    throw new Error("useWorkflow must be used inside <WorkflowProvider>");
  }

  return store;
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createInitialWorkflowState);
  const [scope, setScope] = useState<TrackedScope>("mine");
  const [rightTab, setRightTab] = useState<RightTab>("sources");
  const [expandedBriefIds, setExpandedBriefIds] = useState<ReadonlySet<string>>(
    () => new Set(state.activeBriefId ? [state.activeBriefId] : []),
  );
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(() => new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [tweaks, setTweak] = useWorkbenchTweaks();
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const currentMember = state.teamMembers.find((member) => member.id === state.currentMemberId) ?? state.teamMembers[0];

  // 当前选中对象掉出「我关注的」范围时，静默跳到第一个可见对象
  const visibleTracked = useMemo(() => {
    if (scope === "team") {
      return state.trackingObjects;
    }

    return state.trackingObjects.filter((object) => currentMember.trackingObjectIds.includes(object.id));
  }, [state.trackingObjects, scope, currentMember]);

  useEffect(() => {
    if (visibleTracked.length > 0 && !visibleTracked.some((object) => object.id === state.selectedTrackingObjectId)) {
      setState((current) => selectTrackingObject(current, visibleTracked[0].id, { silent: true }));
    }
  }, [visibleTracked, state.selectedTrackingObjectId]);

  const nowIso = () => new Date().toISOString();

  const store: WorkbenchStore = {
    state,
    currentMember,
    scope,
    setScope,
    rightTab,
    setRightTab,
    expandedBriefIds,
    toggleExpand: (briefId) => {
      setExpandedBriefIds((previous) => {
        const next = new Set(previous);

        if (next.has(briefId)) {
          next.delete(briefId);
        } else {
          next.add(briefId);
        }

        return next;
      });
    },
    runningIds,
    addOpen,
    setAddOpen,
    tweaks,
    setTweak,

    pickTracked: (trackingObjectId) => {
      setState((current) =>
        current.selectedTrackingObjectId === trackingObjectId
          ? current
          : selectTrackingObject(current, trackingObjectId, { now: nowIso() }),
      );
    },

    startSearch: (fail) => {
      const target = state.trackingObjects.find((object) => object.id === state.selectedTrackingObjectId);

      if (!target || runningIds.has(target.id)) {
        return;
      }

      const queryCount = buildTrackingObjectQueries(target).length;

      setState((current) =>
        appendWorkflowLog(
          current,
          {
            level: "info",
            event: "search_started",
            message: `日更搜索启动 · ${target.nameZh ?? target.name} · 查询 ${queryCount} 条 · 来源池 ${current.sources.length} 个`,
            trackingObjectId: target.id,
          },
          { now: nowIso() },
        ),
      );
      setRunningIds((previous) => new Set(previous).add(target.id));

      const timer = setTimeout(() => {
        timersRef.current.delete(timer);
        setRunningIds((previous) => {
          const next = new Set(previous);

          next.delete(target.id);
          return next;
        });
        setState((current) =>
          fail
            ? runFailedMockSearchForTrackingObject(current, target.id, SIMULATED_FAILURE, { now: nowIso() })
            : runMockSearchForTrackingObject(current, target.id, { now: nowIso() }),
        );
      }, fail ? 1200 : 1400);

      timersRef.current.add(timer);
    },

    generateBrief: (signalId) => {
      setState((current) => {
        try {
          return generateBriefForSignal(current, signalId, { locale: "zh", now: nowIso() });
        } catch (error) {
          return appendWorkflowLog(
            current,
            {
              level: "error",
              message: `简报生成失败 · ${error instanceof Error ? error.message : "未知工作流错误"}`,
            },
            { now: nowIso() },
          );
        }
      });
      setExpandedBriefIds((previous) => new Set(previous).add(`brief-${signalId}`));
    },

    openBriefFromSignal: (signalId) => {
      const brief = state.editorialBriefs.find((item) => item.candidateSignalId === signalId);

      if (!brief) {
        return;
      }

      setState((current) =>
        appendWorkflowLog(
          { ...current, activeBriefId: brief.id },
          { level: "info", message: `打开已生成简报：${brief.briefTitle}`, briefId: brief.id },
          { now: nowIso() },
        ),
      );
      setExpandedBriefIds((previous) => new Set(previous).add(brief.id));
    },

    selectBrief: (briefId) => {
      setState((current) => ({ ...current, activeBriefId: briefId }));
    },

    decide: (briefId, decision) => {
      setState((current) => {
        try {
          return screenBrief(
            current,
            { briefId, ...DECISION_INPUT[decision], decidedBy: current.currentMemberId },
            { now: nowIso() },
          );
        } catch (error) {
          return appendWorkflowLog(
            current,
            {
              level: "error",
              message: `筛选操作失败 · ${error instanceof Error ? error.message : "未知工作流错误"}`,
              briefId,
            },
            { now: nowIso() },
          );
        }
      });

      if (decision === "pool") {
        setRightTab("pool");
      }
    },

    observeWithDimensions: (briefId, dimensions) => {
      setState((current) => {
        try {
          return screenBrief(
            current,
            {
              briefId,
              decision: "watch",
              reason: "持续观察",
              observationDimensions: dimensions,
              decidedBy: current.currentMemberId,
            },
            { now: nowIso() },
          );
        } catch (error) {
          return appendWorkflowLog(
            current,
            {
              level: "error",
              message: `加入持续观察失败 · ${error instanceof Error ? error.message : "未知工作流错误"}`,
              briefId,
            },
            { now: nowIso() },
          );
        }
      });
    },

    claim: (topicCardId) => {
      setState((current) => claimTopicCard(current, topicCardId, current.currentMemberId, { now: nowIso() }));
    },

    switchMember: (memberId) => {
      setState((current) => switchTeamMember(current, memberId, { now: nowIso() }));
    },

    subToggle: (trackingObjectId) => {
      setState((current) => toggleSubscription(current, current.currentMemberId, trackingObjectId, { now: nowIso() }));
    },

    addTracked: (input) => {
      setState((current) => addTrackingObject(current, input, { now: nowIso() }));
      setScope(input.subscribe ? "mine" : "team");
    },

    logDemo: (level, message, briefId) => {
      setState((current) => appendWorkflowLog(current, { level, message, briefId }, { now: nowIso() }));
    },

    focusBrief: (briefId, tab = "sources") => {
      setState((current) => {
        const brief = current.editorialBriefs.find((item) => item.id === briefId);

        if (!brief) {
          return current;
        }

        return {
          ...selectTrackingObject(current, brief.trackingObjectId, { silent: true }),
          activeBriefId: briefId,
        };
      });
      setExpandedBriefIds((previous) => new Set(previous).add(briefId));
      setRightTab(tab);
    },

    ensureProduction: (briefId) => {
      setState((current) => ensureProductionDraft(current, briefId));
    },

    editScriptSection: (briefId, sectionId, body) => {
      setState((current) => updateScriptSection(current, briefId, sectionId, body));
    },

    editStoryboardShot: (briefId, shotNumber, patch) => {
      setState((current) => updateStoryboardShot(current, briefId, shotNumber, patch));
    },

    toggleCheck: (briefId, itemId) => {
      setState((current) => toggleProductionChecklistItem(current, briefId, itemId));
    },

    resetProduction: (briefId) => {
      setState((current) => resetProductionDraft(current, briefId));
    },
  };

  return <WorkflowContext.Provider value={store}>{children}</WorkflowContext.Provider>;
}
