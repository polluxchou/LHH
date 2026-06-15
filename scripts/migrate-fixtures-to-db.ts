import { createClient } from "@supabase/supabase-js";
import { fid, fids } from "../lib/workflow/fixture-ids.ts";
import {
  trackingObjects,
  sources,
  searchRuns,
  candidateSignals,
  editorialBriefs,
  contentValueScores,
} from "../lib/data/phase1-fixtures.ts";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SPACE_NAME = "林哈哈聊太空";

async function main() {
  const { data: space, error: spErr } = await admin.from("spaces").select("id").eq("name", SPACE_NAME).single();
  if (spErr || !space) throw new Error(`space "${SPACE_NAME}" not found: ${spErr?.message}`);
  const spaceId = space.id;

  // 1. tracking_objects (space-scoped)
  const trackRows = trackingObjects.map((o) => ({
    id: fid(o.id), space_id: spaceId, name: o.name, name_zh: o.nameZh ?? null, type: o.type,
    aliases: o.aliases, country_or_region: o.countryOrRegion, official_url: o.officialUrl,
    primary_track: o.primaryTrack, why_track: o.whyTrack, keywords: o.keywords,
    excluded_terms: o.excludedTerms, languages: o.languages, regions: o.regions,
    preferred_sources: o.preferredSources, search_frequency: o.searchFrequency, priority: o.priority,
    created_at: o.createdAt, updated_at: o.updatedAt,
  }));
  await upsert("tracking_objects", trackRows, "id");

  // 2. sources (global, no space_id). Keyed by fid(id); rare url-collision with ingest rows is tolerated.
  const sourceRows = sources.map((s) => ({
    id: fid(s.id), url: s.url, title: s.title, publisher: s.publisher, published_at: s.publishedAt,
    retrieved_at: s.retrievedAt, source_type: s.sourceType, confidence: s.confidence, notes: s.notes,
  }));
  await upsert("sources", sourceRows, "id");

  // 3. search_runs (space-scoped)
  const runRows = searchRuns.map((r) => ({
    id: fid(r.id), space_id: spaceId, tracking_object_id: fid(r.trackingObjectId), run_date: r.runDate,
    query_set: r.querySet, status: r.status, result_count: r.resultCount, new_signal_count: r.newSignalCount,
    error_summary: r.errorSummary ?? null,
  }));
  await upsert("search_runs", runRows, "id");

  // 4. candidate_signals (space-scoped)
  const signalRows = candidateSignals.map((c) => ({
    id: fid(c.id), space_id: spaceId, tracking_object_id: fid(c.trackingObjectId),
    search_run_id: fid(c.searchRunId), signal_type: c.signalType, headline: c.headline, summary: c.summary,
    event_date: c.eventDate, detected_at: c.detectedAt, source_ids: fids(c.sourceIds), dedupe_key: c.dedupeKey,
    novelty_status: c.noveltyStatus, confidence: c.confidence,
  }));
  await upsert("candidate_signals", signalRows, "id");

  // 5. editorial_briefs (space-scoped; tagline/fact_bullets via 0004)
  const briefRows = editorialBriefs.map((b) => ({
    id: fid(b.id), space_id: spaceId, candidate_signal_id: fid(b.candidateSignalId),
    tracking_object_id: fid(b.trackingObjectId), brief_title: b.briefTitle, tagline: b.tagline ?? null,
    fact_summary: b.factSummary, fact_bullets: b.factBullets ?? [], source_summary: b.sourceSummary,
    map_context: b.mapContext, why_it_matters: b.whyItMatters, possible_angles: b.possibleAngles,
    open_questions: b.openQuestions, risk_notes: b.riskNotes, location_anchor_ids: fids(b.locationAnchorIds),
    status: b.status, created_at: b.createdAt,
  }));
  await upsert("editorial_briefs", briefRows, "id");

  // 6. content_value_scores (composite_score derived on read, not stored)
  const scoreRows = contentValueScores.map((s) => ({
    editorial_brief_id: fid(s.editorialBriefId), space_id: spaceId, freshness_score: s.freshnessScore,
    importance_score: s.importanceScore, rarity_score: s.rarityScore, audience_interest_score: s.audienceInterestScore,
    visual_potential_score: s.visualPotentialScore, risk_score: s.riskScore,
    overall_recommendation: s.overallRecommendation, scoring_notes: s.scoringNotes,
  }));
  await upsert("content_value_scores", scoreRows, "editorial_brief_id");

  console.log("✅ Migrated fixtures → DB (space 林哈哈聊太空):");
  console.log(`   tracking_objects=${trackRows.length} sources=${sourceRows.length} search_runs=${runRows.length}`);
  console.log(`   candidate_signals=${signalRows.length} editorial_briefs=${briefRows.length} scores=${scoreRows.length}`);
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("MIGRATION FAILED:", e.message); process.exit(1); });
