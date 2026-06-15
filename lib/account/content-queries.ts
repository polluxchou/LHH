import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  CandidateSignal, ContentValueScore, EditorialBrief, SearchRun, Source, TrackingObject,
} from "@/lib/domain/types";

/** The DB-backed slice of a space's content (ingestion outputs + migrated demo). */
export interface SpaceContent {
  trackingObjects: TrackingObject[];
  searchRuns: SearchRun[];
  sources: Source[];
  candidateSignals: CandidateSignal[];
  editorialBriefs: EditorialBrief[];
  contentValueScores: ContentValueScore[];
}

const EMPTY: SpaceContent = {
  trackingObjects: [], searchRuns: [], sources: [], candidateSignals: [], editorialBriefs: [], contentValueScores: [],
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function rows(data: unknown): any[] {
  return (data ?? []) as any[];
}

export async function getSpaceContent(spaceId: string): Promise<SpaceContent> {
  if (!spaceId) return EMPTY;
  const db = await createSupabaseServerClient();

  const [toRes, runRes, sigRes, briefRes, scoreRes] = await Promise.all([
    db.from("tracking_objects").select("*").eq("space_id", spaceId),
    db.from("search_runs").select("*").eq("space_id", spaceId),
    db.from("candidate_signals").select("*").eq("space_id", spaceId),
    db.from("editorial_briefs").select("*").eq("space_id", spaceId),
    db.from("content_value_scores").select("*").eq("space_id", spaceId),
  ]);

  const trackingObjects: TrackingObject[] = rows(toRes.data).map((r) => ({
    id: r.id, name: r.name, nameZh: r.name_zh ?? undefined, type: r.type, aliases: r.aliases ?? [],
    countryOrRegion: r.country_or_region, officialUrl: r.official_url, primaryTrack: r.primary_track,
    whyTrack: r.why_track, keywords: r.keywords ?? [], excludedTerms: r.excluded_terms ?? [],
    languages: r.languages ?? [], regions: r.regions ?? [], preferredSources: r.preferred_sources ?? [],
    searchFrequency: r.search_frequency, priority: r.priority, createdAt: r.created_at, updatedAt: r.updated_at,
  }));

  const searchRuns: SearchRun[] = rows(runRes.data).map((r) => ({
    id: r.id, trackingObjectId: r.tracking_object_id, runDate: r.run_date, querySet: r.query_set ?? [],
    status: r.status, resultCount: r.result_count, newSignalCount: r.new_signal_count,
    errorSummary: r.error_summary ?? null,
  }));

  const candidateSignals: CandidateSignal[] = rows(sigRes.data).map((r) => ({
    id: r.id, trackingObjectId: r.tracking_object_id, searchRunId: r.search_run_id, signalType: r.signal_type,
    headline: r.headline, summary: r.summary, eventDate: r.event_date ?? null, detectedAt: r.detected_at,
    sourceIds: r.source_ids ?? [], dedupeKey: r.dedupe_key, noveltyStatus: r.novelty_status, confidence: r.confidence,
  }));
  const confidenceBySignal = new Map(candidateSignals.map((s) => [s.id, s.confidence]));

  const editorialBriefs: EditorialBrief[] = rows(briefRes.data).map((r) => ({
    id: r.id, candidateSignalId: r.candidate_signal_id, trackingObjectId: r.tracking_object_id,
    briefTitle: r.brief_title, tagline: r.tagline ?? undefined, factSummary: r.fact_summary,
    factBullets: r.fact_bullets ?? undefined, sourceSummary: r.source_summary, mapContext: r.map_context ?? null,
    whyItMatters: r.why_it_matters, possibleAngles: r.possible_angles ?? [], openQuestions: r.open_questions ?? [],
    riskNotes: r.risk_notes ?? [], locationAnchorIds: r.location_anchor_ids ?? [], status: r.status,
    createdAt: r.created_at,
  }));
  const signalByBrief = new Map(editorialBriefs.map((b) => [b.id, b.candidateSignalId]));

  // compositeScore is not stored (ingestion omits it; no column). Derive it the way the
  // app does — round(confidence × 100) of the brief's candidate signal.
  const contentValueScores: ContentValueScore[] = rows(scoreRes.data).map((r) => {
    const conf = confidenceBySignal.get(signalByBrief.get(r.editorial_brief_id) ?? "") ?? 0;
    return {
      editorialBriefId: r.editorial_brief_id, compositeScore: Math.round(conf * 100),
      freshnessScore: r.freshness_score, importanceScore: r.importance_score, rarityScore: r.rarity_score,
      audienceInterestScore: r.audience_interest_score, visualPotentialScore: r.visual_potential_score,
      riskScore: r.risk_score, overallRecommendation: r.overall_recommendation, scoringNotes: r.scoring_notes,
    };
  });

  // sources are global; fetch only those referenced by this space's signals.
  const referenced = new Set<string>();
  for (const s of candidateSignals) for (const id of s.sourceIds) referenced.add(id);
  let sources: Source[] = [];
  if (referenced.size > 0) {
    const { data } = await db.from("sources").select("*").in("id", [...referenced]);
    sources = rows(data).map((r) => ({
      id: r.id, url: r.url, title: r.title, publisher: r.publisher ?? null, publishedAt: r.published_at ?? null,
      retrievedAt: r.retrieved_at, sourceType: r.source_type, confidence: r.confidence, notes: r.notes ?? null,
    }));
  }

  return { trackingObjects, searchRuns, sources, candidateSignals, editorialBriefs, contentValueScores };
}
