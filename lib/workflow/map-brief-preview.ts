import type { EditorialBrief } from "@/lib/domain/types";

export interface MapBriefPreview {
  title: string;
  tagline: string | null;
  facts: string[];
  sourceSummary: string;
  mapContext: string;
  whyItMatters: string;
  possibleAngles: string[];
  openQuestions: string[];
}

export function buildMapBriefPreview(brief: EditorialBrief): MapBriefPreview {
  return {
    title: brief.briefTitle,
    tagline: brief.tagline ?? null,
    facts: brief.factBullets ?? [brief.factSummary],
    sourceSummary: brief.sourceSummary,
    mapContext: brief.mapContext ?? "暂无地图上下文",
    whyItMatters: brief.whyItMatters,
    possibleAngles: brief.possibleAngles,
    openQuestions: brief.openQuestions,
  };
}
