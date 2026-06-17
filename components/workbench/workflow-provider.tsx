"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TeamMember } from "@/lib/domain/types";
import { useSpaceSession } from "@/components/account/space-provider";
import { addTrackingObjectToSpace, deleteTrackingObject, runSearchForObject, setSubscription, persistGeneratedBrief } from "@/lib/account/content-mutations";
import {
  appendWorkflowLog,
  claimTopicCard,
  createInitialWorkflowState,
  ensureProductionDraft,
  generateBriefForSignal,
  resetProductionDraft,
  setProductionDraft,
  runFailedMockSearchForTrackingObject,
  screenBrief,
  removeTrackingObject,
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
import { generateProductionAction } from "@/app/actions/generate-production";
import { generateBriefAction } from "@/app/actions/generate-brief";
import {
  generateArticleAction,
  regenerateArticleSectionAction,
  translateArticleAction,
  retranslateSectionAction,
} from "@/app/actions/generate-article";
import { buildArticleStub, buildTranslateStub } from "@/lib/article/stub-article";
import {
  setArticleDraft,
  setArticleSectionBody,
  editArticleSection,
  upsertTranslation,
  editTranslationSection,
} from "@/lib/workflow/article-draft";
import type { ArticleLang, ArticlePlatform, ArticleSection, ArticleType } from "@/lib/domain/article";
import type { AnalyzedBrief } from "@/lib/ingest/types";
import type { StoryboardShot } from "@/lib/domain/production";
import type { TrackedScope } from "@/components/workbench/tracked-list";
import type { BriefUiStatus } from "@/components/workbench/helpers";
import { useWorkbenchTweaks, type WorkbenchTweaks } from "@/components/workbench/tweaks-panel";
import { getCopy, type Locale } from "@/lib/i18n/copy";

export type RightTab = "sources" | "map" | "pool";

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
  generateBrief: (signalId: string) => Promise<void>;
  /** 正在调 AI 生成简报的候选信号 id（按钮 loading 用） */
  generatingBriefIds: ReadonlySet<string>;
  openBriefFromSignal: (signalId: string) => void;
  selectBrief: (briefId: string) => void;
  decide: (briefId: string, decision: Exclude<BriefUiStatus, "pending">) => void;
  /** 「持续观察」：带多条观察维度，记为 watch 状态（不进入选题库） */
  observeWithDimensions: (briefId: string, dimensions: string[]) => void;
  claim: (topicCardId: string) => void;
  switchMember: (memberId: string) => void;
  subToggle: (trackingObjectId: string) => void;
  addTracked: (input: AddTrackingObjectInput) => void;
  removeTracked: (trackingObjectId: string) => void;
  logDemo: (level: WorkflowRunLogEntry["level"], message: string, briefId?: string) => void;
  /** select object + brief + expand + right tab — used by cross-page jumps */
  focusBrief: (briefId: string, tab?: RightTab) => void;
  // ── production drafts ──
  ensureProduction: (briefId: string) => void;
  editScriptSection: (briefId: string, sectionId: string, body: string) => void;
  editStoryboardShot: (briefId: string, shotNumber: number, patch: Partial<Omit<StoryboardShot, "n">>) => void;
  toggleCheck: (briefId: string, itemId: string) => void;
  resetProduction: (briefId: string) => void;
  generateProduction: (briefId: string, targetDuration?: string) => Promise<void>;
  // ── article drafts ──
  /** 正在整篇生成/翻译的 topicCard.id（loading） */
  generatingArticleKeys: ReadonlySet<string>;
  /** 正在单段生成/重译的 key：`${topicCardId}:${sectionId}` 或 `${topicCardId}:${lang}:${sectionId}` */
  busyArticleSectionKeys: ReadonlySet<string>;
  generateArticle: (
    topicCardId: string,
    cfg: { type: ArticleType; platform: ArticlePlatform; audience: string },
  ) => Promise<void>;
  regenerateArticleSection: (topicCardId: string, sectionId: string) => Promise<void>;
  translateArticleLangs: (topicCardId: string, langs: ArticleLang[]) => Promise<void>;
  retranslateArticleSection: (topicCardId: string, lang: ArticleLang, sectionId: string) => Promise<void>;
  editArticleSectionBody: (topicCardId: string, sectionId: string, body: string) => void;
  editArticleTranslationBody: (topicCardId: string, lang: ArticleLang, sectionId: string, body: string) => void;
}

const WorkflowContext = createContext<WorkbenchStore | null>(null);

export function useWorkflow(): WorkbenchStore {
  const store = useContext(WorkflowContext);

  if (!store) {
    throw new Error("useWorkflow must be used inside <WorkflowProvider>");
  }

  return store;
}

export function WorkflowProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const session = useSpaceSession();
  const router = useRouter();
  const L = getCopy(locale).log;
  const A = getCopy(locale).articleStudio;
  const DECISION_INPUT: Record<
    Exclude<BriefUiStatus, "pending">,
    { decision: "approved" | "watch" | "rejected"; reason: string }
  > = {
    pool: { decision: "approved", reason: "" },
    watch: { decision: "watch", reason: L.reasonWatch },
    rejected: { decision: "rejected", reason: L.reasonRejected },
  };
  // Content state is owned per-space by SpaceProvider; mirror it here behind the
  // existing setState(updater) contract so every action below stays unchanged.
  const state = session.contentState ?? createInitialWorkflowState();
  const setState = (updater: LocalWorkflowState | ((current: LocalWorkflowState) => LocalWorkflowState)) => {
    // Thread the functional updater through setContentState so multiple setState
    // calls in one handler compose off the latest state instead of the stale
    // render snapshot (otherwise the last call clobbers the others).
    session.setContentState((prev) => {
      const base = prev ?? createInitialWorkflowState();
      return typeof updater === "function"
        ? (updater as (current: LocalWorkflowState) => LocalWorkflowState)(base)
        : updater;
    });
  };
  const [scope, setScope] = useState<TrackedScope>("mine");
  const [rightTab, setRightTab] = useState<RightTab>("sources");
  const [expandedBriefIds, setExpandedBriefIds] = useState<ReadonlySet<string>>(
    () => new Set(state.activeBriefId ? [state.activeBriefId] : []),
  );
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(() => new Set());
  const [generatingBriefIds, setGeneratingBriefIds] = useState<ReadonlySet<string>>(() => new Set());
  const [generatingArticleKeys, setGeneratingArticleKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [busyArticleSectionKeys, setBusyArticleSectionKeys] = useState<ReadonlySet<string>>(() => new Set());
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
    generatingBriefIds,
    generatingArticleKeys,
    busyArticleSectionKeys,
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

      const clearRunning = () =>
        setRunningIds((previous) => {
          const next = new Set(previous);
          next.delete(target.id);
          return next;
        });
      const label = target.nameZh ?? target.name;
      setRunningIds((previous) => new Set(previous).add(target.id));

      if (fail) {
        // Demo button「模拟搜索失败」keeps the mock failure path.
        setState((current) =>
          appendWorkflowLog(current, { level: "info", event: "search_started", message: L.searchStartMock(label), trackingObjectId: target.id }, { now: nowIso() }),
        );
        const timer = setTimeout(() => {
          timersRef.current.delete(timer);
          clearRunning();
          setState((current) => runFailedMockSearchForTrackingObject(current, target.id, L.simulatedFailure, { now: nowIso() }));
        }, 1200);
        timersRef.current.add(timer);
        return;
      }

      // Real on-demand search: Gemini grounding → DeepSeek → write to DB, then refresh.
      setState((current) =>
        appendWorkflowLog(current, { level: "info", event: "search_started", message: L.searchStartReal(label), trackingObjectId: target.id }, { now: nowIso() }),
      );
      runSearchForObject(target.id)
        .then(({ wrote, reason }) => {
          clearRunning();
          setState((current) =>
            appendWorkflowLog(
              current,
              {
                level: wrote ? "success" : "warning",
                event: "search_completed",
                message: wrote ? L.searchDoneWrote(label) : L.searchDoneEmpty(reason ?? L.searchNoNew),
                trackingObjectId: target.id,
              },
              { now: nowIso() },
            ),
          );
          router.refresh();
        })
        .catch((error) => {
          clearRunning();
          setState((current) =>
            appendWorkflowLog(
              current,
              { level: "error", event: "search_failed", message: L.searchFailed(error instanceof Error ? error.message : L.errUnknown), trackingObjectId: target.id },
              { now: nowIso() },
            ),
          );
        });
    },

    generateBrief: async (signalId) => {
      const signal = state.candidateSignals.find((s) => s.id === signalId);
      // 已有简报：沿用原同步逻辑（去重提示 + 展开），不调 AI。
      const existing = state.editorialBriefs.find((b) => b.candidateSignalId === signalId);
      if (!signal || existing) {
        setState((current) => {
          try {
            return generateBriefForSignal(current, signalId, { locale: "zh", now: nowIso() });
          } catch (error) {
            return appendWorkflowLog(
              current,
              { level: "error", message: L.briefGenFailed(error instanceof Error ? error.message : L.errWorkflow) },
              { now: nowIso() },
            );
          }
        });
        setExpandedBriefIds((previous) => new Set(previous).add(`brief-${signalId}`));
        return;
      }

      // 实时调 DeepSeek：把信号 + 来源综合成 factSummary/whyItMatters。失败回退模板。
      const subject = state.trackingObjects.find((o) => o.id === signal.trackingObjectId);
      const brand = subject?.nameZh ?? subject?.name ?? L.defaultSubject;
      const sources = state.sources.filter((s) => signal.sourceIds.includes(s.id));

      setGeneratingBriefIds((prev) => new Set(prev).add(signalId));
      let ai: AnalyzedBrief | undefined;
      try {
        const result = await generateBriefAction({
          brand,
          signal: { headline: signal.headline, summary: signal.summary, eventDate: signal.eventDate },
          sources: sources.map((s) => ({ title: s.title, url: s.url, publishedAt: s.publishedAt })),
        });
        if (result.ok) ai = result.analyzed;
        else store.logDemo("warning", L.aiFailedTemplate(result.reason), `brief-${signalId}`);
      } catch (error) {
        store.logDemo(
          "warning",
          L.aiFailedTemplate(error instanceof Error ? error.message : L.errUnknown),
          `brief-${signalId}`,
        );
      } finally {
        setGeneratingBriefIds((prev) => {
          const next = new Set(prev);
          next.delete(signalId);
          return next;
        });
      }

      // 1) Commit to the in-memory store for instant feedback (functional updater so it
      //    composes off the latest state — e.g. any AI-failure warning logged above).
      let failed = false;
      setState((current) => {
        try {
          return generateBriefForSignal(current, signalId, { locale: "zh", now: nowIso(), ai });
        } catch (error) {
          failed = true;
          return appendWorkflowLog(
            current,
            { level: "error", message: L.briefGenFailed(error instanceof Error ? error.message : L.errWorkflow) },
            { now: nowIso() },
          );
        }
      });
      if (failed) return;
      if (ai) store.logDemo("success", L.aiBriefDone(signal.headline), `brief-${signalId}`);
      setExpandedBriefIds((previous) => new Set(previous).add(`brief-${signalId}`));

      // 2) Persist to the DB so the brief survives a refresh (mirrors the search path).
      //    Recompute the brief fields deterministically from the snapshot — pure, used
      //    only to read fields; the DB generates the row id.
      const draft = generateBriefForSignal(state, signalId, { locale: "zh", now: nowIso(), ai });
      const brief = draft.editorialBriefs.find((b) => b.candidateSignalId === signalId);
      const score = brief ? draft.contentValueScores.find((s) => s.editorialBriefId === brief.id) : undefined;
      if (!brief || !score) return;
      persistGeneratedBrief({
        trackingObjectId: brief.trackingObjectId,
        candidateSignalId: signalId,
        briefTitle: brief.briefTitle,
        tagline: brief.tagline ?? null,
        factBullets: brief.factBullets ?? [],
        factSummary: brief.factSummary,
        sourceSummary: brief.sourceSummary,
        mapContext: brief.mapContext ?? null,
        whyItMatters: brief.whyItMatters,
        possibleAngles: brief.possibleAngles,
        openQuestions: brief.openQuestions,
        riskNotes: brief.riskNotes ?? [],
        status: brief.status,
        score: {
          freshnessScore: score.freshnessScore,
          importanceScore: score.importanceScore,
          rarityScore: score.rarityScore,
          audienceInterestScore: score.audienceInterestScore,
          visualPotentialScore: score.visualPotentialScore,
          riskScore: score.riskScore,
          overallRecommendation: score.overallRecommendation,
          scoringNotes: score.scoringNotes,
        },
      })
        .then((res) => {
          if (!res.ok) store.logDemo("warning", L.briefNotPersisted(res.reason ?? L.errUnknown), `brief-${signalId}`);
        })
        .catch((error) => {
          store.logDemo("warning", L.briefNotPersisted(error instanceof Error ? error.message : L.errUnknown), `brief-${signalId}`);
        });
    },

    openBriefFromSignal: (signalId) => {
      const brief = state.editorialBriefs.find((item) => item.candidateSignalId === signalId);

      if (!brief) {
        return;
      }

      setState((current) =>
        appendWorkflowLog(
          { ...current, activeBriefId: brief.id },
          { level: "info", message: L.openBrief(brief.briefTitle), briefId: brief.id },
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
              message: L.screenFailed(error instanceof Error ? error.message : L.errWorkflow),
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
              reason: L.reasonObserve,
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
              message: L.observeFailed(error instanceof Error ? error.message : L.errWorkflow),
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
      const spaceId = session.currentSpaceId;
      const wasSubscribed = currentMember.trackingObjectIds.includes(trackingObjectId);
      const flip = () =>
        setState((current) => toggleSubscription(current, current.currentMemberId, trackingObjectId, { now: nowIso() }));
      flip(); // optimistic
      if (spaceId) {
        setSubscription(spaceId, trackingObjectId, !wasSubscribed).catch(() => flip()); // persist; revert on failure
      }
    },

    addTracked: (input) => {
      const spaceId = session.currentSpaceId;
      if (!spaceId) return;
      // Persist to DB, then refresh so the server-built state picks up the new object.
      setScope("team");
      addTrackingObjectToSpace(spaceId, input)
        .then(() => router.refresh())
        .catch((error) =>
          setState((current) =>
            appendWorkflowLog(
              current,
              { level: "error", message: L.addFailed(error instanceof Error ? error.message : L.errUnknown) },
              { now: nowIso() },
            ),
          ),
        );
    },

    removeTracked: (trackingObjectId) => {
      const spaceId = session.currentSpaceId;
      if (!spaceId) return;
      // Optimistically drop it locally (and its signals/briefs/subscriptions), then persist.
      // On failure, router.refresh() pulls the authoritative server state back.
      setState((current) => removeTrackingObject(current, trackingObjectId, { now: nowIso() }));
      deleteTrackingObject(spaceId, trackingObjectId)
        .then(() => router.refresh())
        .catch((error) => {
          setState((current) =>
            appendWorkflowLog(
              current,
              { level: "error", message: L.removeFailed(error instanceof Error ? error.message : L.errUnknown) },
              { now: nowIso() },
            ),
          );
          router.refresh();
        });
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

    generateProduction: async (briefId, targetDuration) => {
      const brief = state.editorialBriefs.find((b) => b.id === briefId);
      if (!brief) {
        store.logDemo("warning", L.prodNotFound(briefId), briefId);
        return;
      }
      const topicCard = state.topicCards.find((t) => t.sourceEditorialBriefId === briefId) ?? null;
      const result = await generateProductionAction({ brief, topicCard, targetDuration });
      if (result.ok) {
        setState((current) => setProductionDraft(current, briefId, result.pkg));
        store.logDemo("success", L.prodDone(brief.briefTitle), briefId);
      } else {
        store.logDemo("warning", L.prodFailedTemplate(result.reason), briefId);
      }
    },

    // ── article drafts ──
    generateArticle: async (topicCardId, cfg) => {
      const topicCard = state.topicCards.find((t) => t.id === topicCardId) ?? null;
      const brief = topicCard
        ? state.editorialBriefs.find((b) => b.id === topicCard.sourceEditorialBriefId) ?? null
        : null;
      if (!topicCard || !brief) return;

      setGeneratingArticleKeys((p) => new Set(p).add(topicCardId));
      let sections: ArticleSection[] | null = null;
      try {
        const r = await generateArticleAction({ brief, topicCard, type: cfg.type, platform: cfg.platform, audience: cfg.audience });
        if (r.ok) sections = r.value;
        else store.logDemo("warning", A.genFailLog(r.reason));
      } catch (e) {
        store.logDemo("warning", A.genFailLog(e instanceof Error ? e.message : "unknown"));
      } finally {
        setGeneratingArticleKeys((p) => { const n = new Set(p); n.delete(topicCardId); return n; });
      }
      const finalSections =
        sections ?? buildArticleStub({ brief, topicCard, type: cfg.type, platform: cfg.platform, audience: cfg.audience });
      setState((cur) =>
        setArticleDraft(cur, topicCardId, {
          type: cfg.type, platform: cfg.platform, audience: cfg.audience, sections: finalSections, translations: [],
        }),
      );
    },

    regenerateArticleSection: async (topicCardId, sectionId) => {
      const topicCard = state.topicCards.find((t) => t.id === topicCardId) ?? null;
      const brief = topicCard
        ? state.editorialBriefs.find((b) => b.id === topicCard.sourceEditorialBriefId) ?? null
        : null;
      const draft = state.articleDrafts[topicCardId];
      const section = draft?.sections.find((s) => s.id === sectionId);
      if (!topicCard || !brief || !draft || !section) return;

      const key = `${topicCardId}:${sectionId}`;
      setBusyArticleSectionKeys((p) => new Set(p).add(key));
      try {
        const r = await regenerateArticleSectionAction({
          brief, topicCard, type: draft.type, platform: draft.platform, audience: draft.audience, section,
        });
        if (r.ok) setState((cur) => setArticleSectionBody(cur, topicCardId, sectionId, r.value));
        else store.logDemo("warning", A.genFailLog(r.reason));
      } catch (e) {
        store.logDemo("warning", A.genFailLog(e instanceof Error ? e.message : "unknown"));
      } finally {
        setBusyArticleSectionKeys((p) => { const n = new Set(p); n.delete(key); return n; });
      }
    },

    translateArticleLangs: async (topicCardId, langs) => {
      const draft = state.articleDrafts[topicCardId];
      if (!draft || langs.length === 0) return;
      setGeneratingArticleKeys((p) => new Set(p).add(topicCardId));
      try {
        for (const lang of langs) {
          const r = await translateArticleAction({ sections: draft.sections, lang });
          const sections = r.ok ? r.value : buildTranslateStub(draft.sections, lang);
          if (!r.ok) store.logDemo("warning", A.genFailLog(r.reason));
          setState((cur) => upsertTranslation(cur, topicCardId, { lang, sections }));
        }
      } finally {
        setGeneratingArticleKeys((p) => { const n = new Set(p); n.delete(topicCardId); return n; });
      }
    },

    retranslateArticleSection: async (topicCardId, lang, sectionId) => {
      const draft = state.articleDrafts[topicCardId];
      const section = draft?.sections.find((s) => s.id === sectionId);
      if (!draft || !section) return;
      const key = `${topicCardId}:${lang}:${sectionId}`;
      setBusyArticleSectionKeys((p) => new Set(p).add(key));
      try {
        const r = await retranslateSectionAction({ section, lang });
        if (r.ok) setState((cur) => editTranslationSection(cur, topicCardId, lang, sectionId, r.value));
        else store.logDemo("warning", A.genFailLog(r.reason));
      } catch (e) {
        store.logDemo("warning", A.genFailLog(e instanceof Error ? e.message : "unknown"));
      } finally {
        setBusyArticleSectionKeys((p) => { const n = new Set(p); n.delete(key); return n; });
      }
    },

    editArticleSectionBody: (topicCardId, sectionId, body) =>
      setState((cur) => editArticleSection(cur, topicCardId, sectionId, body)),
    editArticleTranslationBody: (topicCardId, lang, sectionId, body) =>
      setState((cur) => editTranslationSection(cur, topicCardId, lang, sectionId, body)),
  };

  return <WorkflowContext.Provider value={store}>{children}</WorkflowContext.Provider>;
}
