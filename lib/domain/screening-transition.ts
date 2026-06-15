import type {
  EditorialBrief,
  ScreeningDecision,
  ScreeningDecisionValue,
  TopicCard,
} from "@/lib/domain/types";

const DEFAULT_DECIDED_AT = "2026-06-07T00:00:00.000Z";

export interface ScreeningTransitionInput {
  editorialBrief: EditorialBrief;
  decision: ScreeningDecisionValue;
  reason: string;
  sourceIds: string[];
  /** 仅「持续观察」(watch) 使用：多条观察维度 */
  observationDimensions?: string[];
  decidedBy: string;
  decidedAt?: string;
}

export interface ScreeningTransitionResult {
  screeningDecision: ScreeningDecision;
  topicCard: TopicCard | null;
}

export function applyScreeningTransition(input: ScreeningTransitionInput): ScreeningTransitionResult {
  if ((input.decision === "watch" || input.decision === "rejected") && input.reason.trim().length === 0) {
    throw new Error("A screening reason is required for watch and rejected decisions");
  }

  const cleanedDimensions = (input.observationDimensions ?? [])
    .map((dimension) => dimension.trim())
    .filter((dimension) => dimension.length > 0);

  const screeningDecision: ScreeningDecision = {
    editorialBriefId: input.editorialBrief.id,
    decision: input.decision,
    reason: input.reason.trim(),
    ...(cleanedDimensions.length > 0 ? { observationDimensions: cleanedDimensions } : {}),
    decidedBy: input.decidedBy,
    decidedAt: input.decidedAt ?? DEFAULT_DECIDED_AT,
  };

  // 仅「通过」进入选题库（生成选题卡）
  const entersPool = input.decision === "approved";

  if (!entersPool) {
    return {
      screeningDecision,
      topicCard: null,
    };
  }

  if (input.sourceIds.length === 0) {
    throw new Error("At least one source id is required to move a brief into the topic pool");
  }

  return {
    screeningDecision,
    topicCard: createTopicCard(input.editorialBrief, input.sourceIds, input.decidedBy, cleanedDimensions),
  };
}

function createTopicCard(
  editorialBrief: EditorialBrief,
  sourceIds: string[],
  decidedBy: string,
  observationDimensions: string[],
): TopicCard {
  return {
    id: `topic-${editorialBrief.id}`,
    sourceEditorialBriefId: editorialBrief.id,
    workingTitle: editorialBrief.briefTitle,
    coreQuestion: editorialBrief.openQuestions[0] ?? `What makes "${editorialBrief.briefTitle}" worth covering now?`,
    recommendedFormat: getRecommendedFormat(editorialBrief),
    keyFacts: [editorialBrief.factSummary, editorialBrief.sourceSummary],
    sourceIds,
    mapContext: editorialBrief.mapContext,
    status: "new",
    ownerId: decidedBy,
    ...(observationDimensions.length > 0 ? { observationDimensions } : {}),
  };
}

const FORMAT_KEYWORDS: Array<[TopicCard["recommendedFormat"], string[]]> = [
  ["policy_explainer", ["policy", "regulatory", "license", "政策", "监管", "许可", "听证", "审计"]],
  ["technical_explainer", ["technical", "engine", "test", "技术", "试车", "试验", "发动机", "回收", "热盾"]],
  ["industry_map", ["map", "facility", "location", "地图", "设施", "工厂", "基地", "产能"]],
];

function getRecommendedFormat(editorialBrief: EditorialBrief): TopicCard["recommendedFormat"] {
  const text = [editorialBrief.briefTitle, ...editorialBrief.possibleAngles].join(" ").toLowerCase();

  for (const [format, keywords] of FORMAT_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return format;
    }
  }

  return "news_brief";
}
