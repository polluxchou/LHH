import type {
  CandidateSignal,
  CandidateSignalType,
  ContentValueScore,
  EditorialBrief,
  LocationAnchor,
  LocationAnchorType,
  ScreeningDecision,
  Source,
  TopicCard,
  TrackingObjectPriority,
} from "@/lib/domain/types";
import type { WorkflowRunLogEntry } from "@/lib/workflow/local-workflow";

// ── 信号类型 ────────────────────────────────────────────────
export type SignalKind = "milestone" | "facility" | "policy";

export const SIGNAL_KIND_BY_TYPE: Record<CandidateSignalType, SignalKind> = {
  technical_project_milestone: "milestone",
  location_facility_change: "facility",
  policy_regulatory_change: "policy",
};

export function signalKind(signal: CandidateSignal): SignalKind {
  return SIGNAL_KIND_BY_TYPE[signal.signalType];
}

// ── 简报 UI 状态（域状态 + 筛选决策 → 设计稿四态） ─────────────
export type BriefUiStatus = "pending" | "pool" | "watch" | "rejected";

export function deriveBriefUiStatus(brief: EditorialBrief, decisions: ScreeningDecision[]): BriefUiStatus {
  if (brief.status !== "screened") {
    return "pending";
  }

  const decision = decisions.find((item) => item.editorialBriefId === brief.id);

  switch (decision?.decision) {
    case "approved":
      return "pool";
    case "watch":
      return "watch";
    case "rejected":
      return "rejected";
    default:
      return "pending";
  }
}

export const BRIEF_STATUS_ORDER: Record<BriefUiStatus, number> = {
  pending: 0,
  pool: 1,
  watch: 2,
  rejected: 3,
};

// ── 优先级 ─────────────────────────────────────────────────
export function priorityClass(priority: number): "high" | "mid" | "low" {
  if (priority <= 1) return "high";
  if (priority === 2) return "mid";
  return "low";
}

export const PRIORITY_BY_CLASS: Record<"high" | "mid" | "low", TrackingObjectPriority> = {
  high: 1,
  mid: 2,
  low: 3,
};

// ── 来源类型展示（className 是 CSS，label 文案走字典 labels.sourceKind[key]）──
export type SourceKindKey = "official" | "regulatory" | "social" | "database" | "media" | "other";

export function sourceKindMeta(sourceType: Source["sourceType"]): { className: string; key: SourceKindKey } {
  switch (sourceType) {
    case "official":
      return { className: "official", key: "official" };
    case "regulator":
      return { className: "regulatory", key: "regulatory" };
    case "social_public_post":
      return { className: "social", key: "social" };
    case "database":
      return { className: "press", key: "database" };
    case "authoritative_media":
    case "trade_media":
      return { className: "press", key: "media" };
    default:
      return { className: "press", key: "other" };
  }
}

// ── 地点类型展示（glyph 与语言无关，label 文案走字典 labels.locationKind[type]）──
export const LOCATION_KIND_GLYPH: Record<LocationAnchorType, string> = {
  launch_site: "🚀",
  company_office: "🏢",
  manufacturing_supply_chain: "🏭",
  test_site: "🧪",
  investor_policy_industrial_park: "🏛",
  extraterrestrial: "🌑",
};

export function formatCoord(location: LocationAnchor): string {
  if (location.coordLabel) {
    return location.coordLabel;
  }

  if (location.latitude === null || location.longitude === null) {
    return location.countryOrRegion;
  }

  const lat = `${Math.abs(location.latitude).toFixed(3)}°${location.latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(location.longitude).toFixed(3)}°${location.longitude >= 0 ? "E" : "W"}`;

  return `${lat}, ${lng}`;
}

/** Project a location onto the conceptual map canvas (percent coordinates). */
export function projectLocation(location: LocationAnchor, index: number): { x: number; y: number } {
  if (location.latitude === null || location.longitude === null) {
    return { x: Math.min(96, 20 + index * 18), y: 50 };
  }

  const x = ((location.longitude + 180) / 360) * 100;
  const y = ((90 - location.latitude) / 180) * 100;

  return { x: Math.max(4, Math.min(96, x)), y: Math.max(10, Math.min(90, y)) };
}

// ── 选题形式标签 ─────────────────────────────────────────────
// `formatLabel` 是逐卡的内容覆盖（含时长等编辑信息），保留原样；缺省时回退到
// 字典枚举标签 labels.format[recommendedFormat]，由调用方按 locale 传入。
export function topicFormatLabel(
  topicCard: TopicCard,
  formatLabels: Record<TopicCard["recommendedFormat"], string>,
): string {
  return topicCard.formatLabel ?? formatLabels[topicCard.recommendedFormat];
}

// ── 评分 ───────────────────────────────────────────────────
export function compositeScoreFor(briefId: string, scores: ContentValueScore[]): number {
  return scores.find((score) => score.editorialBriefId === briefId)?.compositeScore ?? 0;
}

// ── 时间格式（演示数据以北京时间为叙事基准） ───────────────────
const TIME_ZONE = "Asia/Shanghai";

export function formatTimeHMS(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleTimeString("zh-CN", { timeZone: TIME_ZONE, hour12: false });
}

export function formatTimeHM(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleTimeString("zh-CN", { timeZone: TIME_ZONE, hour12: false, hour: "2-digit", minute: "2-digit" });
}

/** "2026-06-10T04:30:00.000Z" → "06-10 12:30"（上海时区） */
export function formatDateTimeShort(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function formatDateShort(iso: string): string {
  return iso.slice(0, 10);
}

// ── 运行日志渲染 ─────────────────────────────────────────────
export type LogLv = "info" | "ok" | "warn" | "err";

export const LOG_LV_BY_LEVEL: Record<WorkflowRunLogEntry["level"], LogLv> = {
  info: "info",
  success: "ok",
  warning: "warn",
  error: "err",
};

const DECISION_LABELS: Record<string, string> = {
  approved: "通过 · 入选题库",
  watch: "持续观察",
  rejected: "拒绝",
};

/** Render a run-log entry as a Chinese log line, using the structured payload when present. */
export function formatRunLogLine(entry: WorkflowRunLogEntry, locale: "en" | "zh" = "zh"): string {
  const data = entry.data;

  if (locale !== "zh" || !data) {
    return entry.message;
  }

  switch (entry.event) {
    case "tracking_object_selected":
      return `选择追踪对象：${data.name}`;
    case "search_completed":
      return `搜索完成 · ${data.name} · 命中 ${data.results} 条 · 去重后 ${data.signals} 条候选信号（重复 ${data.dedup} 条）`;
    case "search_failed":
      return `搜索失败 · ${data.name} · ${data.error}`;
    case "brief_generated":
      return `简报已生成 [score ${data.score}] · 待筛：${data.title}`;
    case "duplicate_brief_detected":
      return `重复简报处理 · 已有简报，跳过生成：${data.title}`;
    case "screening_decision":
      return `简报筛选 · ${DECISION_LABELS[String(data.decision)] ?? data.decision}：${data.title}`;
    case "user_switched":
      return `切换用户 · 当前：${data.name}（${data.role}）`;
    case "subscription_changed":
      return data.action === "subscribe" ? `订阅追踪对象：${data.name}` : `退订追踪对象：${data.name}`;
    case "tracking_object_added":
      return `新增追踪对象：${data.name}${data.subscriber ? `（${data.subscriber} 已订阅）` : ""}`;
    case "topic_claimed":
      return `领取选题 · ${data.member} 已负责：${data.title}`;
    default:
      return entry.message;
  }
}
