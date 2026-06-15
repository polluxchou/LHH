import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestResult } from "@/lib/ingest/types";

/**
 * 幂等写入一次品牌的产出：
 * search_run → sources(upsert on url) → candidate_signal(upsert on (tracking_object_id,dedupe_key))
 * → editorial_brief → content_value_score。
 * dedupeKey = 该信号首条 source 的 canonical url（足以保证同一品牌同事件不重复）。
 */
export async function writeIngestResult(
  db: SupabaseClient,
  result: IngestResult,
): Promise<{ wrote: boolean; reason?: string }> {
  const { trackingObjectId, querySet, freshItems, analyzed } = result;

  const { data: run, error: runErr } = await db
    .from("search_runs")
    .insert({
      tracking_object_id: trackingObjectId,
      query_set: querySet,
      status: "completed",
      result_count: freshItems.length,
      new_signal_count: analyzed ? 1 : 0,
    })
    .select("id")
    .single();
  if (runErr) return { wrote: false, reason: `search_run: ${runErr.message}` };
  if (!analyzed || freshItems.length === 0) return { wrote: false, reason: "no fresh items" };

  const sourceRows = freshItems.map((it) => ({
    url: it.url,
    title: it.title || it.url,
    published_at: it.publishedDate ? `${it.publishedDate}T00:00:00Z` : null,
    source_type: "authoritative_media" as const,
    confidence: 0.7,
  }));
  const { data: sources, error: srcErr } = await db
    .from("sources")
    .upsert(sourceRows, { onConflict: "url" })
    .select("id");
  if (srcErr) return { wrote: false, reason: `sources: ${srcErr.message}` };
  const sourceIds = (sources ?? []).map((s) => s.id as string);

  const dedupeKey = freshItems[0].url;
  const { data: signal, error: sigErr } = await db
    .from("candidate_signals")
    .upsert(
      {
        tracking_object_id: trackingObjectId,
        search_run_id: run.id,
        signal_type: analyzed.signalType,
        headline: analyzed.headline,
        summary: analyzed.summary,
        event_date: analyzed.eventDate,
        source_ids: sourceIds,
        dedupe_key: dedupeKey,
        novelty_status: "new",
        confidence: analyzed.confidence,
      },
      { onConflict: "tracking_object_id,dedupe_key" },
    )
    .select("id")
    .single();
  if (sigErr) return { wrote: false, reason: `signal: ${sigErr.message}` };

  const { data: brief, error: brErr } = await db
    .from("editorial_briefs")
    .upsert(
      {
        candidate_signal_id: signal.id,
        tracking_object_id: trackingObjectId,
        brief_title: analyzed.briefTitle,
        fact_summary: analyzed.factSummary,
        source_summary: freshItems.map((i) => i.title).join("; "),
        why_it_matters: analyzed.whyItMatters,
        possible_angles: analyzed.possibleAngles,
        open_questions: analyzed.openQuestions,
        risk_notes: analyzed.riskNotes,
        status: "ready_for_screening",
      },
      { onConflict: "candidate_signal_id" },
    )
    .select("id")
    .single();
  if (brErr) return { wrote: false, reason: `brief: ${brErr.message}` };

  const sc = analyzed.score;
  const { error: scErr } = await db.from("content_value_scores").upsert({
    editorial_brief_id: brief.id,
    freshness_score: sc.freshnessScore,
    importance_score: sc.importanceScore,
    rarity_score: sc.rarityScore,
    audience_interest_score: sc.audienceInterestScore,
    visual_potential_score: sc.visualPotentialScore,
    risk_score: sc.riskScore,
    overall_recommendation: sc.overallRecommendation,
    scoring_notes: sc.scoringNotes,
  });
  if (scErr) return { wrote: false, reason: `score: ${scErr.message}` };

  return { wrote: true };
}
