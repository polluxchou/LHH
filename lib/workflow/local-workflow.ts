import {
  candidateSignals,
  contentValueScores,
  editorialBriefs,
  initialRunLog,
  locationAnchors,
  productions,
  screeningDecisions,
  searchRuns,
  sources,
  teamMembers,
  topicCards,
  trackingObjects,
} from "@/lib/data/phase1-fixtures";
import { generateEditorialBrief } from "@/lib/briefing/brief-generator";
import { applyScreeningTransition } from "@/lib/domain/screening-transition";
import { createStubProduction } from "@/lib/production/stub-production";
import type { ProductionPackage, StoryboardShot } from "@/lib/domain/production";
import type { ArticleDraft } from "@/lib/domain/article";
import type { AnalyzedBrief } from "@/lib/ingest/types";
import type {
  CandidateSignal,
  ContentValueScore,
  EditorialBrief,
  LocationAnchor,
  ScreeningDecision,
  ScreeningDecisionValue,
  SearchRun,
  Source,
  TeamMember,
  TopicCard,
  TrackingObject,
  TrackingObjectPriority,
  TrackingObjectType,
  Verification,
} from "@/lib/domain/types";
import { getOverallRecommendation } from "@/lib/domain/scoring";
import { buildTrackingObjectQueries } from "@/lib/search/query-builder";

const PHASE_2_TIMESTAMP = "2026-06-07T00:00:00.000Z";

export interface WorkflowFeedback {
  message: string;
  detail?: string;
  tone: "info" | "success" | "warning";
}

export type WorkflowRunLogEvent =
  | "fixtures_loaded"
  | "tracking_object_selected"
  | "search_started"
  | "search_completed"
  | "search_failed"
  | "brief_generated"
  | "duplicate_brief_detected"
  | "screening_decision"
  | "workflow_error"
  | "user_switched"
  | "subscription_changed"
  | "tracking_object_added"
  | "tracking_object_removed"
  | "topic_claimed"
  | "ui_action";

export interface WorkflowRunLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  event: WorkflowRunLogEvent;
  message: string;
  detail?: string;
  /** structured payload so the UI can render localized log lines */
  data?: Record<string, string | number>;
  trackingObjectId?: string;
  candidateSignalId?: string;
  briefId?: string;
}

export interface LocalWorkflowState {
  teamMembers: TeamMember[];
  currentMemberId: string;
  trackingObjects: TrackingObject[];
  searchRuns: SearchRun[];
  sources: Source[];
  candidateSignals: CandidateSignal[];
  editorialBriefs: EditorialBrief[];
  contentValueScores: ContentValueScore[];
  screeningDecisions: ScreeningDecision[];
  topicCards: TopicCard[];
  locationAnchors: LocationAnchor[];
  /** script / storyboard / task drafts per editorial brief id (支持二次编辑) */
  productionDrafts: Record<string, ProductionPackage>;
  /** 「生成文章」客户端草稿态，key = topicCard.id（刷新重置） */
  articleDrafts: Record<string, ArticleDraft>;
  selectedTrackingObjectId: string;
  activeBriefId: string | null;
  lastFeedback: WorkflowFeedback | null;
  runLog: WorkflowRunLogEntry[];
}

export interface ScreenBriefInput {
  briefId: string;
  decision: ScreeningDecisionValue;
  reason: string;
  /** 仅「持续观察」使用：多条观察维度 */
  observationDimensions?: string[];
  decidedBy: string;
}

interface WorkflowCallOptions {
  /** ISO timestamp for log entries and derived records; defaults to the deterministic demo timestamp */
  now?: string;
}

interface SelectTrackingObjectOptions extends WorkflowCallOptions {
  /** skip feedback + run-log entry (used for programmatic scope adjustments) */
  silent?: boolean;
}

interface GenerateBriefOptions extends WorkflowCallOptions {
  locale?: "en" | "zh";
  /** 实时 DeepSeek 分析结果；存在时用 AI 的 factSummary/whyItMatters 等覆盖模板拼装 */
  ai?: AnalyzedBrief;
  verification?: Verification;
}

export interface AddTrackingObjectInput {
  nameZh: string;
  name?: string;
  type: TrackingObjectType;
  priority: TrackingObjectPriority;
  primaryTrack?: string;
  headquarters?: string;
  keywords?: string[];
  whyTrack?: string;
  /** subscribe the current member immediately */
  subscribe: boolean;
}

export function createInitialWorkflowState(): LocalWorkflowState {
  return {
    teamMembers: teamMembers.map((member) => ({ ...member, trackingObjectIds: [...member.trackingObjectIds] })),
    currentMemberId: teamMembers[0]?.id ?? "",
    trackingObjects: [...trackingObjects],
    searchRuns: [...searchRuns],
    sources: [...sources],
    candidateSignals: [...candidateSignals],
    editorialBriefs: [...editorialBriefs],
    contentValueScores: [...contentValueScores],
    screeningDecisions: [...screeningDecisions],
    topicCards: [...topicCards],
    locationAnchors: [...locationAnchors],
    productionDrafts: cloneProductions(productions),
    articleDrafts: {},
    selectedTrackingObjectId: trackingObjects.some((object) => object.id === "starbase")
      ? "starbase"
      : (trackingObjects[0]?.id ?? ""),
    activeBriefId: editorialBriefs.find((brief) => brief.status !== "screened")?.id ?? editorialBriefs[0]?.id ?? null,
    lastFeedback: null,
    runLog: [...initialRunLog],
  };
}

export function selectTrackingObject(
  state: LocalWorkflowState,
  trackingObjectId: string,
  options: SelectTrackingObjectOptions = {},
): LocalWorkflowState {
  const trackingObject = assertTrackingObjectExists(state, trackingObjectId);
  const nextState: LocalWorkflowState = {
    ...state,
    selectedTrackingObjectId: trackingObjectId,
    activeBriefId:
      state.editorialBriefs.find(
        (brief) => brief.trackingObjectId === trackingObjectId && brief.status !== "screened",
      )?.id ??
      state.editorialBriefs.find((brief) => brief.trackingObjectId === trackingObjectId)?.id ??
      null,
  };

  if (options.silent) {
    return nextState;
  }

  return {
    ...nextState,
    lastFeedback: {
      message: "Tracking object selected.",
      detail: trackingObject.name,
      tone: "info",
    },
    runLog: appendRunLog(
      state,
      {
        level: "info",
        event: "tracking_object_selected",
        message: "Tracking object selected.",
        detail: trackingObject.name,
        data: { name: trackingObject.nameZh ?? trackingObject.name },
        trackingObjectId,
      },
      options.now,
    ),
  };
}

export function runMockSearchForTrackingObject(
  state: LocalWorkflowState,
  trackingObjectId: string,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const trackingObject = assertTrackingObjectExists(state, trackingObjectId);
  const now = options.now ?? PHASE_2_TIMESTAMP;
  const runDate = now.slice(0, 10);
  const querySet = buildTrackingObjectQueries(trackingObject);
  const allObjectSignals = state.candidateSignals.filter((signal) => signal.trackingObjectId === trackingObjectId);
  const objectSignals = allObjectSignals.filter((signal) => signal.noveltyStatus !== "duplicate");
  const duplicateCount = allObjectSignals.length - objectSignals.length;
  const searchRun: SearchRun = {
    id: `search-run-${trackingObjectId}-${runDate}`,
    trackingObjectId,
    runDate,
    querySet,
    status: "completed",
    resultCount: allObjectSignals.length * 6 + 5,
    newSignalCount: objectSignals.length,
    errorSummary: null,
    completedAt: now,
  };
  const otherRuns = state.searchRuns.filter((run) => run.trackingObjectId !== trackingObjectId);

  return {
    ...state,
    searchRuns: [...otherRuns, searchRun],
    selectedTrackingObjectId: trackingObjectId,
    lastFeedback: {
      message: `Daily search completed for ${trackingObject.name}.`,
      detail: `${querySet.length} queries produced ${objectSignals.length} candidate signals.`,
      tone: "success",
    },
    runLog: appendRunLog(
      state,
      {
        level: "success",
        event: "search_completed",
        message: `Daily search completed for ${trackingObject.name}.`,
        detail: `${querySet.length} queries, ${objectSignals.length} candidate signals.`,
        data: {
          name: trackingObject.nameZh ?? trackingObject.name,
          queries: querySet.length,
          results: searchRun.resultCount,
          signals: allObjectSignals.length,
          dedup: duplicateCount,
        },
        trackingObjectId,
      },
      options.now,
    ),
  };
}

export function runFailedMockSearchForTrackingObject(
  state: LocalWorkflowState,
  trackingObjectId: string,
  errorSummary: string,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const trackingObject = assertTrackingObjectExists(state, trackingObjectId);
  const now = options.now ?? PHASE_2_TIMESTAMP;
  const runDate = now.slice(0, 10);
  const querySet = buildTrackingObjectQueries(trackingObject);
  const failedRun: SearchRun = {
    id: `search-run-${trackingObjectId}-${runDate}-failed`,
    trackingObjectId,
    runDate,
    querySet,
    status: "failed",
    resultCount: 0,
    newSignalCount: 0,
    errorSummary,
    completedAt: now,
  };
  const otherRuns = state.searchRuns.filter((run) => run.trackingObjectId !== trackingObjectId);

  return {
    ...state,
    searchRuns: [...otherRuns, failedRun],
    selectedTrackingObjectId: trackingObjectId,
    lastFeedback: {
      message: `Daily search failed for ${trackingObject.name}.`,
      detail: errorSummary,
      tone: "warning",
    },
    runLog: appendRunLog(
      state,
      {
        level: "error",
        event: "search_failed",
        message: `Daily search failed for ${trackingObject.name}.`,
        detail: errorSummary,
        data: { name: trackingObject.nameZh ?? trackingObject.name, error: errorSummary },
        trackingObjectId,
      },
      options.now,
    ),
  };
}

const ZH_SIGNAL_TYPE_LABELS: Record<CandidateSignal["signalType"], string> = {
  technical_project_milestone: "技术/项目里程碑",
  location_facility_change: "选址/设施变更",
  policy_regulatory_change: "政策/监管变化",
};

/**
 * 用候选信号与其来源的真实内容，组装一份中文简报草稿（确定性、不臆造）。
 * factSummary 直接取信号摘要，factBullets/whyItMatters 等由真实字段派生，
 * 取代此前的占位文案，确保简报与信号本身一致。
 */
function verificationRiskNote(v: Verification): string {
  const pct = Math.round(v.confidence * 100);
  switch (v.status) {
    case "corroborated": return `✅ X 核查:已获佐证(可信度 ${pct}%)`;
    case "disputed": return `⚠️ X 核查:未获官方佐证 / 说法存疑`;
    case "contradicted": return `❌ X 核查:X 上存在矛盾信息`;
    default: return `— X 核查:无 X 覆盖,未能核验`;
  }
}

export function buildZhBriefFields(
  generated: EditorialBrief,
  signal: CandidateSignal,
  sources: Source[],
  subjectName: string,
  ai?: AnalyzedBrief,
  verification?: Verification,
): EditorialBrief {
  const pct = Math.round(signal.confidence * 100);
  const kind = ZH_SIGNAL_TYPE_LABELS[signal.signalType];
  const sourceText = sources.map((s) => `${s.publisher ?? "来源"}《${s.title}》`).join("；");
  const sourceSummary = sourceText ? `共 ${sources.length} 个来源：${sourceText}。` : generated.sourceSummary;

  // 有 DeepSeek 实时分析结果 → 用 AI 的 factSummary/whyItMatters 等；事实列点附上事件日期/来源上下文。
  if (ai) {
    const aiBullets = [
      ai.factSummary,
      signal.eventDate ? `事件日期：${signal.eventDate}` : null,
      sourceText ? `来源：${sourceText}` : null,
    ].filter((x): x is string => Boolean(x));

    return {
      ...generated,
      tagline: `${kind} · AI 综合 ${sources.length} 个来源`,
      factSummary: ai.factSummary,
      factBullets: aiBullets,
      sourceSummary,
      whyItMatters: ai.whyItMatters,
      possibleAngles: ai.possibleAngles.length ? ai.possibleAngles : [`${kind}解读`, `${subjectName}动态追踪`],
      openQuestions: ai.openQuestions.length ? ai.openQuestions : ["该说法能否由官方或监管来源交叉确认？"],
      riskNotes: [...(ai.riskNotes.length ? ai.riskNotes : [`来源置信度 ${pct}%，发布前需核实原始报道。`]), ...(verification ? [verificationRiskNote(verification)] : [])],
      verification,
    };
  }

  const factBullets = [
    signal.summary,
    signal.eventDate ? `事件日期：${signal.eventDate}` : null,
    sourceText ? `来源：${sourceText}` : null,
  ].filter((x): x is string => Boolean(x));

  return {
    ...generated,
    tagline: `${kind} · 来源置信度 ${pct}%`,
    factSummary: signal.summary,
    factBullets,
    sourceSummary,
    whyItMatters: `这是一条关于「${subjectName}」的${kind}信号，来源置信度 ${pct}%。建议核实关键数字与时间线后，再判断是否值得展开选题。`,
    possibleAngles: [`${kind}解读`, `${subjectName}动态追踪`, "结合来源的事实梳理"],
    openQuestions: ["该说法能否由官方或监管来源交叉确认？", "与上一次已知状态相比，发生了什么变化？"],
    riskNotes: [...generated.riskNotes, `来源置信度 ${pct}%，发布前需核实原始报道。`, ...(verification ? [verificationRiskNote(verification)] : [])],
    verification,
  };
}

export function generateBriefForSignal(
  state: LocalWorkflowState,
  candidateSignalId: string,
  options: GenerateBriefOptions = {},
): LocalWorkflowState {
  const signal = assertCandidateSignalExists(state, candidateSignalId);
  const existingBrief = state.editorialBriefs.find((brief) => brief.candidateSignalId === candidateSignalId);

  if (existingBrief) {
    return {
      ...state,
      activeBriefId: existingBrief.id,
      lastFeedback: {
        message: "Brief already exists for this candidate signal.",
        detail: existingBrief.briefTitle,
        tone: "info",
      },
      runLog: appendRunLog(
        state,
        {
          level: "info",
          event: "duplicate_brief_detected",
          message: "Duplicate brief generation skipped.",
          detail: existingBrief.briefTitle,
          data: { title: existingBrief.briefTitle },
          trackingObjectId: existingBrief.trackingObjectId,
          candidateSignalId,
          briefId: existingBrief.id,
        },
        options.now,
      ),
    };
  }

  const matchingSources = state.sources.filter((source) => signal.sourceIds.includes(source.id));
  const locationAnchorIds = state.locationAnchors
    .filter((location) => location.relatedTrackingObjectIds.includes(signal.trackingObjectId))
    .map((location) => location.id);
  const generated = generateEditorialBrief(signal, matchingSources, {
    locationAnchorIds,
    mapContext: createMapContext(state.locationAnchors, locationAnchorIds),
    createdAt: options.now,
  });
  const subjectObject = state.trackingObjects.find((o) => o.id === signal.trackingObjectId);
  const subjectName = subjectObject?.nameZh ?? subjectObject?.name ?? "该追踪对象";
  const brief: EditorialBrief =
    options.locale === "zh"
      ? buildZhBriefFields(generated, signal, matchingSources, subjectName, options.ai, options.verification)
      : generated;
  const score = createDefaultScore(brief, signal.confidence);

  return {
    ...state,
    editorialBriefs: [...state.editorialBriefs, brief],
    contentValueScores: [...state.contentValueScores, score],
    activeBriefId: brief.id,
    lastFeedback: {
      message: "Source-backed editorial brief generated.",
      detail: brief.briefTitle,
      tone: "success",
    },
    runLog: appendRunLog(
      state,
      {
        level: "success",
        event: "brief_generated",
        message: "Source-backed editorial brief generated.",
        detail: brief.briefTitle,
        data: { title: brief.briefTitle, score: score.compositeScore },
        trackingObjectId: brief.trackingObjectId,
        candidateSignalId,
        briefId: brief.id,
      },
      options.now,
    ),
  };
}

export function screenBrief(
  state: LocalWorkflowState,
  input: ScreenBriefInput,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const brief = assertBriefExists(state, input.briefId);

  if (brief.status === "screened") {
    throw new Error("Brief has already been screened");
  }

  const signal = assertCandidateSignalExists(state, brief.candidateSignalId);
  const result = applyScreeningTransition({
    editorialBrief: brief,
    decision: input.decision,
    reason: input.reason,
    sourceIds: signal.sourceIds,
    observationDimensions: input.observationDimensions,
    decidedBy: input.decidedBy,
    decidedAt: options.now ?? PHASE_2_TIMESTAMP,
  });
  const screenedBrief: EditorialBrief = { ...brief, status: "screened" };
  const nextTopicCards = result.topicCard ? upsertTopicCard(state.topicCards, result.topicCard) : state.topicCards;

  return {
    ...state,
    editorialBriefs: state.editorialBriefs.map((item) => (item.id === brief.id ? screenedBrief : item)),
    screeningDecisions: upsertScreeningDecision(state.screeningDecisions, result.screeningDecision),
    topicCards: nextTopicCards,
    activeBriefId: brief.id,
    lastFeedback: {
      message: result.topicCard
        ? "Brief added to the local topic pool."
        : `Brief marked as ${input.decision}.`,
      detail: result.topicCard
        ? result.topicCard.workingTitle
        : "Watch and rejected briefs do not enter the topic pool.",
      tone: result.topicCard ? "success" : "warning",
    },
    runLog: appendRunLog(
      state,
      {
        level: result.topicCard ? "success" : "warning",
        event: "screening_decision",
        message: `Brief marked as ${input.decision}.`,
        detail: input.reason || result.topicCard?.workingTitle,
        data: { title: brief.briefTitle, decision: input.decision },
        trackingObjectId: brief.trackingObjectId,
        candidateSignalId: brief.candidateSignalId,
        briefId: brief.id,
      },
      options.now,
    ),
  };
}

export function switchTeamMember(
  state: LocalWorkflowState,
  memberId: string,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const member = assertTeamMemberExists(state, memberId);

  return {
    ...state,
    currentMemberId: memberId,
    runLog: appendRunLog(
      state,
      {
        level: "info",
        event: "user_switched",
        message: `Switched active team member to ${member.name}.`,
        data: { name: member.name, role: member.role },
      },
      options.now,
    ),
  };
}

export function toggleSubscription(
  state: LocalWorkflowState,
  memberId: string,
  trackingObjectId: string,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const member = assertTeamMemberExists(state, memberId);
  const trackingObject = assertTrackingObjectExists(state, trackingObjectId);
  const subscribed = member.trackingObjectIds.includes(trackingObjectId);
  const nextTracking = subscribed
    ? member.trackingObjectIds.filter((id) => id !== trackingObjectId)
    : [...member.trackingObjectIds, trackingObjectId];

  return {
    ...state,
    teamMembers: state.teamMembers.map((item) =>
      item.id === memberId ? { ...item, trackingObjectIds: nextTracking } : item,
    ),
    runLog: appendRunLog(
      state,
      {
        level: subscribed ? "info" : "success",
        event: "subscription_changed",
        message: `${member.name} ${subscribed ? "unsubscribed from" : "subscribed to"} ${trackingObject.name}.`,
        data: {
          name: trackingObject.nameZh ?? trackingObject.name,
          member: member.name,
          action: subscribed ? "unsubscribe" : "subscribe",
        },
        trackingObjectId,
      },
      options.now,
    ),
  };
}

export function addTrackingObject(
  state: LocalWorkflowState,
  input: AddTrackingObjectInput,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const member = assertTeamMemberExists(state, state.currentMemberId);
  const now = options.now ?? PHASE_2_TIMESTAMP;
  const trackingObject: TrackingObject = {
    id: createTrackingObjectId(state, input.name || input.nameZh),
    name: input.name?.trim() || input.nameZh.trim(),
    nameZh: input.nameZh.trim(),
    type: input.type,
    aliases: [],
    countryOrRegion: input.headquarters?.trim() || "待补充",
    officialUrl: null,
    primaryTrack: input.primaryTrack?.trim() || defaultTrackForType(input.type),
    whyTrack: input.whyTrack?.trim() || "由编辑新增 · 等待首次搜索",
    keywords: (input.keywords ?? []).slice(0, 5),
    excludedTerms: [],
    languages: ["zh", "en"],
    regions: [],
    preferredSources: ["official", "authoritative_media"],
    searchFrequency: "daily",
    priority: input.priority,
    createdAt: now,
    updatedAt: now,
    createdBy: member.id,
  };

  return {
    ...state,
    trackingObjects: [...state.trackingObjects, trackingObject],
    teamMembers: input.subscribe
      ? state.teamMembers.map((item) =>
          item.id === member.id ? { ...item, trackingObjectIds: [...item.trackingObjectIds, trackingObject.id] } : item,
        )
      : state.teamMembers,
    selectedTrackingObjectId: trackingObject.id,
    activeBriefId: null,
    lastFeedback: {
      message: "Tracking object added.",
      detail: trackingObject.name,
      tone: "success",
    },
    runLog: appendRunLog(
      state,
      {
        level: "success",
        event: "tracking_object_added",
        message: `Tracking object added: ${trackingObject.name}.`,
        data: input.subscribe
          ? { name: trackingObject.nameZh ?? trackingObject.name, subscriber: member.name }
          : { name: trackingObject.nameZh ?? trackingObject.name },
        trackingObjectId: trackingObject.id,
      },
      options.now,
    ),
  };
}

/**
 * Remove a tracking object and everything that hangs off it, keeping local state
 * self-consistent. Mirrors the DB cascade (signals / briefs / search runs / each
 * member's subscriptions). No-op if the id is unknown (optimistic callers may race a
 * server refresh). If the removed object was selected, fall back to the first remaining.
 */
export function removeTrackingObject(
  state: LocalWorkflowState,
  trackingObjectId: string,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const trackingObject = state.trackingObjects.find((object) => object.id === trackingObjectId);
  if (!trackingObject) return state;

  const trackingObjects = state.trackingObjects.filter((object) => object.id !== trackingObjectId);
  const remainingBriefIds = new Set(
    state.editorialBriefs.filter((brief) => brief.trackingObjectId !== trackingObjectId).map((brief) => brief.id),
  );

  return {
    ...state,
    trackingObjects,
    teamMembers: state.teamMembers.map((member) => ({
      ...member,
      trackingObjectIds: member.trackingObjectIds.filter((id) => id !== trackingObjectId),
    })),
    searchRuns: state.searchRuns.filter((run) => run.trackingObjectId !== trackingObjectId),
    candidateSignals: state.candidateSignals.filter((signal) => signal.trackingObjectId !== trackingObjectId),
    editorialBriefs: state.editorialBriefs.filter((brief) => brief.trackingObjectId !== trackingObjectId),
    productionDrafts: Object.fromEntries(
      Object.entries(state.productionDrafts).filter(([briefId]) => remainingBriefIds.has(briefId)),
    ),
    selectedTrackingObjectId:
      state.selectedTrackingObjectId === trackingObjectId
        ? (trackingObjects[0]?.id ?? "")
        : state.selectedTrackingObjectId,
    activeBriefId: state.activeBriefId && remainingBriefIds.has(state.activeBriefId) ? state.activeBriefId : null,
    runLog: appendRunLog(
      state,
      {
        level: "info",
        event: "tracking_object_removed",
        message: `Tracking object removed: ${trackingObject.name}.`,
        data: { name: trackingObject.nameZh ?? trackingObject.name },
        trackingObjectId,
      },
      options.now,
    ),
  };
}

export function claimTopicCard(
  state: LocalWorkflowState,
  topicCardId: string,
  memberId: string,
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  const member = assertTeamMemberExists(state, memberId);
  const topicCard = state.topicCards.find((item) => item.id === topicCardId);

  if (!topicCard) {
    throw new Error(`Topic card not found: ${topicCardId}`);
  }

  return {
    ...state,
    topicCards: state.topicCards.map((item) =>
      item.id === topicCardId ? { ...item, ownerId: memberId, status: item.status === "new" ? "assigned" : item.status } : item,
    ),
    runLog: appendRunLog(
      state,
      {
        level: "success",
        event: "topic_claimed",
        message: `${member.name} claimed topic: ${topicCard.workingTitle}.`,
        data: { title: topicCard.workingTitle, member: member.name },
        briefId: topicCard.sourceEditorialBriefId,
      },
      options.now,
    ),
  };
}

// ── Production drafts (脚本 / 分镜 / 任务 · 可二次编辑) ──────────

/** Make sure a production draft exists for the brief, building one from the curated fixture or the stub generator. */
export function ensureProductionDraft(state: LocalWorkflowState, briefId: string): LocalWorkflowState {
  if (state.productionDrafts[briefId]) {
    return state;
  }

  const brief = assertBriefExists(state, briefId);
  const topicCard = state.topicCards.find((item) => item.sourceEditorialBriefId === briefId) ?? null;

  return {
    ...state,
    productionDrafts: {
      ...state.productionDrafts,
      [briefId]: createStubProduction(brief, topicCard),
    },
  };
}

export function updateScriptSection(
  state: LocalWorkflowState,
  briefId: string,
  sectionId: string,
  body: string,
): LocalWorkflowState {
  const draft = assertProductionDraftExists(state, briefId);

  return withProductionDraft(state, briefId, {
    ...draft,
    script: {
      ...draft.script,
      sections: draft.script.sections.map((section) => (section.id === sectionId ? { ...section, body } : section)),
    },
  });
}

export function updateStoryboardShot(
  state: LocalWorkflowState,
  briefId: string,
  shotNumber: number,
  patch: Partial<Omit<StoryboardShot, "n">>,
): LocalWorkflowState {
  const draft = assertProductionDraftExists(state, briefId);

  return withProductionDraft(state, briefId, {
    ...draft,
    storyboard: draft.storyboard.map((shot) => (shot.n === shotNumber ? { ...shot, ...patch } : shot)),
  });
}

export function toggleProductionChecklistItem(
  state: LocalWorkflowState,
  briefId: string,
  itemId: string,
): LocalWorkflowState {
  const draft = assertProductionDraftExists(state, briefId);

  return withProductionDraft(state, briefId, {
    ...draft,
    task: {
      ...draft.task,
      checklist: draft.task.checklist.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
    },
  });
}

/** Discard edits, restoring the curated fixture package (or a fresh stub). */
export function resetProductionDraft(state: LocalWorkflowState, briefId: string): LocalWorkflowState {
  const brief = assertBriefExists(state, briefId);
  const topicCard = state.topicCards.find((item) => item.sourceEditorialBriefId === briefId) ?? null;
  const pristine = productions[briefId]
    ? cloneProductions({ [briefId]: productions[briefId] })[briefId]
    : createStubProduction(brief, topicCard);

  return withProductionDraft(state, briefId, pristine);
}

function withProductionDraft(
  state: LocalWorkflowState,
  briefId: string,
  draft: ProductionPackage,
): LocalWorkflowState {
  return {
    ...state,
    productionDrafts: { ...state.productionDrafts, [briefId]: draft },
  };
}

/** 用外部(LLM)生成的生产包覆盖草稿;现有编辑/重置照常工作。 */
export function setProductionDraft(
  state: LocalWorkflowState,
  briefId: string,
  draft: ProductionPackage,
): LocalWorkflowState {
  return withProductionDraft(state, briefId, draft);
}

function assertProductionDraftExists(state: LocalWorkflowState, briefId: string): ProductionPackage {
  const draft = state.productionDrafts[briefId];

  if (!draft) {
    throw new Error(`Production draft not found: ${briefId}`);
  }

  return draft;
}

function cloneProductions(records: Record<string, ProductionPackage>): Record<string, ProductionPackage> {
  return JSON.parse(JSON.stringify(records)) as Record<string, ProductionPackage>;
}

/** Append a UI-originated entry (studio actions, search start ticks, demo affordances) to the run log. */
export function appendWorkflowLog(
  state: LocalWorkflowState,
  entry: {
    level: WorkflowRunLogEntry["level"];
    message: string;
    event?: WorkflowRunLogEvent;
    data?: Record<string, string | number>;
    trackingObjectId?: string;
    briefId?: string;
  },
  options: WorkflowCallOptions = {},
): LocalWorkflowState {
  return {
    ...state,
    runLog: appendRunLog(
      state,
      {
        level: entry.level,
        event: entry.event ?? "ui_action",
        message: entry.message,
        data: entry.data,
        trackingObjectId: entry.trackingObjectId,
        briefId: entry.briefId,
      },
      options.now,
    ),
  };
}

export function getSourcesForBrief(state: LocalWorkflowState, briefId: string): Source[] {
  const brief = assertBriefExists(state, briefId);
  const signal = assertCandidateSignalExists(state, brief.candidateSignalId);

  return state.sources.filter((source) => signal.sourceIds.includes(source.id));
}

function assertTrackingObjectExists(state: LocalWorkflowState, trackingObjectId: string): TrackingObject {
  const trackingObject = state.trackingObjects.find((object) => object.id === trackingObjectId);

  if (!trackingObject) {
    throw new Error(`Tracking object not found: ${trackingObjectId}`);
  }

  return trackingObject;
}

function assertCandidateSignalExists(state: LocalWorkflowState, candidateSignalId: string): CandidateSignal {
  const signal = state.candidateSignals.find((item) => item.id === candidateSignalId);

  if (!signal) {
    throw new Error(`Candidate signal not found: ${candidateSignalId}`);
  }

  return signal;
}

function assertBriefExists(state: LocalWorkflowState, briefId: string): EditorialBrief {
  const brief = state.editorialBriefs.find((item) => item.id === briefId);

  if (!brief) {
    throw new Error(`Editorial brief not found: ${briefId}`);
  }

  return brief;
}

function assertTeamMemberExists(state: LocalWorkflowState, memberId: string): TeamMember {
  const member = state.teamMembers.find((item) => item.id === memberId);

  if (!member) {
    throw new Error(`Team member not found: ${memberId}`);
  }

  return member;
}

function createTrackingObjectId(state: LocalWorkflowState, rawName: string): string {
  const base =
    rawName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || `tracked-${state.trackingObjects.length + 1}`;
  let candidate = base;
  let suffix = 2;

  while (state.trackingObjects.some((object) => object.id === candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function defaultTrackForType(type: TrackingObjectType): string {
  switch (type) {
    case "company":
      return "公司 · 待补充";
    case "facility":
      return "设施 · 待补充";
    case "program":
      return "项目 · 待补充";
    default:
      return "待补充";
  }
}

function createMapContext(locations: LocationAnchor[], locationAnchorIds: string[]): string | null {
  const names = locations
    .filter((location) => locationAnchorIds.includes(location.id))
    .map((location) => location.name);

  return names.length > 0 ? `Related locations: ${names.join(", ")}.` : null;
}

function createDefaultScore(brief: EditorialBrief, confidence: number): ContentValueScore {
  const riskScore = confidence >= 0.8 ? 2 : 3;
  const score = {
    editorialBriefId: brief.id,
    freshnessScore: 4,
    importanceScore: 4,
    rarityScore: 3,
    audienceInterestScore: 4,
    visualPotentialScore: brief.locationAnchorIds.length > 0 ? 5 : 3,
    riskScore,
  };

  return {
    ...score,
    compositeScore: Math.round(confidence * 100),
    overallRecommendation: getOverallRecommendation(score),
    scoringNotes: "Generated by the local workflow from deterministic fixture data.",
  };
}

function upsertScreeningDecision(
  decisions: ScreeningDecision[],
  decision: ScreeningDecision,
): ScreeningDecision[] {
  return [...decisions.filter((item) => item.editorialBriefId !== decision.editorialBriefId), decision];
}

function upsertTopicCard(topicCardList: TopicCard[], topicCard: TopicCard): TopicCard[] {
  return [
    ...topicCardList.filter((item) => item.sourceEditorialBriefId !== topicCard.sourceEditorialBriefId),
    topicCard,
  ];
}

function appendRunLog(
  state: LocalWorkflowState,
  entry: Omit<WorkflowRunLogEntry, "id" | "timestamp">,
  now?: string,
): WorkflowRunLogEntry[] {
  return [...state.runLog, createRunLogEntry(entry, state.runLog.length, now)];
}

function createRunLogEntry(
  entry: Omit<WorkflowRunLogEntry, "id" | "timestamp">,
  sequence: number,
  now?: string,
): WorkflowRunLogEntry {
  return {
    ...entry,
    id: `log-${sequence}-${entry.event}`,
    timestamp: now ?? PHASE_2_TIMESTAMP,
  };
}
