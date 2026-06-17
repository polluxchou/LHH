"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMySpaces } from "@/lib/account/queries";
import { ingestTrackingObject } from "@/lib/ingest/run";
import { canDeleteTrackingObject } from "@/lib/workflow/can-delete-tracking-object";
import type { AddTrackingObjectInput } from "@/lib/workflow/local-workflow";

/**
 * On-demand real search for one tracking object: read its row (for space_id + brand
 * fields), check the caller is a member of that space, then run the real ingest
 * pipeline (Gemini → DeepSeek → write) via the service-role client. Returns the
 * writer's { wrote, reason } so the workbench can log "produced / not produced".
 */
/** Persist a "我关注的" toggle: subscribe=true upserts the row, false deletes it. */
export async function setSubscription(spaceId: string, trackingObjectId: string, subscribe: boolean): Promise<void> {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === spaceId)) throw new Error("forbidden");
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user!.id;
  const admin = createSupabaseAdminClient();
  if (subscribe) {
    await admin.from("space_subscriptions").upsert(
      { space_id: spaceId, user_id: userId, tracking_object_id: trackingObjectId },
      { onConflict: "space_id,user_id,tracking_object_id" },
    );
  } else {
    await admin.from("space_subscriptions").delete()
      .eq("space_id", spaceId).eq("user_id", userId).eq("tracking_object_id", trackingObjectId);
  }
}

export async function runSearchForObject(trackingObjectId: string): Promise<{ wrote: boolean; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: obj, error } = await admin
    .from("tracking_objects")
    .select("id, space_id, name, aliases, keywords, excluded_terms, languages, regions")
    .eq("id", trackingObjectId)
    .single();
  if (error || !obj) throw new Error("object_not_found");

  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === obj.space_id)) throw new Error("forbidden");

  return ingestTrackingObject(admin, {
    id: obj.id, spaceId: obj.space_id, name: obj.name, aliases: obj.aliases ?? [],
    keywords: obj.keywords ?? [], excludedTerms: obj.excluded_terms ?? [],
    languages: obj.languages ?? [], regions: obj.regions ?? [],
  });
}

export interface PersistBriefInput {
  trackingObjectId: string;
  candidateSignalId: string;
  briefTitle: string;
  tagline: string | null;
  factBullets: string[];
  factSummary: string;
  sourceSummary: string;
  mapContext: string | null;
  whyItMatters: string;
  possibleAngles: string[];
  openQuestions: string[];
  riskNotes: string[];
  status: "draft" | "ready_for_screening" | "screened";
  score: {
    freshnessScore: number;
    importanceScore: number;
    rarityScore: number;
    audienceInterestScore: number;
    visualPotentialScore: number;
    riskScore: number;
    overallRecommendation: "strong" | "medium" | "weak";
    scoringNotes: string;
  };
}

/**
 * Persist an on-demand「生成简报」brief so it survives a refresh. Mirrors the ingest
 * writer's brief+score write (editorial_briefs + content_value_scores), scoped to the
 * tracking object's space with a membership check via the service-role client.
 * The DB generates the brief id (uuid); location_anchor_ids is left to its '{}' default
 * since in-memory anchor ids are not DB uuids. Returns the new brief id.
 */
export async function persistGeneratedBrief(
  input: PersistBriefInput,
): Promise<{ ok: boolean; id?: string; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const { data: obj, error: objErr } = await admin
    .from("tracking_objects")
    .select("id, space_id")
    .eq("id", input.trackingObjectId)
    .single();
  if (objErr || !obj) return { ok: false, reason: "object_not_found" };

  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === obj.space_id)) return { ok: false, reason: "forbidden" };

  const { data: brief, error: brErr } = await admin
    .from("editorial_briefs")
    .insert({
      candidate_signal_id: input.candidateSignalId,
      tracking_object_id: input.trackingObjectId,
      space_id: obj.space_id,
      brief_title: input.briefTitle,
      tagline: input.tagline,
      fact_bullets: input.factBullets,
      fact_summary: input.factSummary,
      source_summary: input.sourceSummary,
      map_context: input.mapContext,
      why_it_matters: input.whyItMatters,
      possible_angles: input.possibleAngles,
      open_questions: input.openQuestions,
      risk_notes: input.riskNotes,
      status: input.status,
    })
    .select("id")
    .single();
  if (brErr || !brief) return { ok: false, reason: `brief: ${brErr?.message ?? "insert_failed"}` };

  const s = input.score;
  const { error: scErr } = await admin.from("content_value_scores").insert({
    editorial_brief_id: brief.id,
    space_id: obj.space_id,
    freshness_score: s.freshnessScore,
    importance_score: s.importanceScore,
    rarity_score: s.rarityScore,
    audience_interest_score: s.audienceInterestScore,
    visual_potential_score: s.visualPotentialScore,
    risk_score: s.riskScore,
    overall_recommendation: s.overallRecommendation,
    scoring_notes: s.scoringNotes,
  });
  if (scErr) return { ok: false, reason: `score: ${scErr.message}` };

  return { ok: true, id: brief.id as string };
}

export interface PersistDecisionInput {
  editorialBriefId: string;
  decision: "approved" | "watch" | "rejected";
  reason: string;
  observationDimensions: string[];
  decidedBy: string;
  decidedAt: string;
  /** present only for `approved` — the topic card the transition produced */
  topicCard?: {
    sourceEditorialBriefId: string;
    workingTitle: string;
    coreQuestion: string;
    recommendedFormat: string;
    formatLabel: string | null;
    keyFacts: string[];
    sourceIds: string[];
    mapContext: string | null;
    status: string;
    ownerId: string | null;
    observationDimensions: string[];
  };
}

/** Resolve a brief's space and verify the caller is a member of it. */
async function spaceForBrief(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  editorialBriefId: string,
): Promise<{ ok: true; spaceId: string } | { ok: false; reason: string }> {
  const { data: brief, error } = await admin
    .from("editorial_briefs")
    .select("space_id")
    .eq("id", editorialBriefId)
    .single();
  if (error || !brief) return { ok: false, reason: "brief_not_found" };
  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === brief.space_id)) return { ok: false, reason: "forbidden" };
  return { ok: true, spaceId: brief.space_id as string };
}

/**
 * Persist a screening decision so it survives a refresh (previously in-memory only).
 * Upserts screening_decisions (PK = editorial_brief_id); for `approved`, also upserts the
 * topic card (unique on source_editorial_brief_id). Space-scoped, membership-checked,
 * service-role. The DB generates the topic-card id (uuid).
 */
export async function persistScreeningDecision(
  input: PersistDecisionInput,
): Promise<{ ok: boolean; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const space = await spaceForBrief(admin, input.editorialBriefId);
  if (!space.ok) return space;

  const { error: decErr } = await admin.from("screening_decisions").upsert(
    {
      editorial_brief_id: input.editorialBriefId,
      space_id: space.spaceId,
      decision: input.decision,
      reason: input.reason,
      observation_dimensions: input.observationDimensions,
      decided_by: input.decidedBy,
      decided_at: input.decidedAt,
    },
    { onConflict: "editorial_brief_id" },
  );
  if (decErr) return { ok: false, reason: `decision: ${decErr.message}` };

  if (input.decision === "approved" && input.topicCard) {
    const tc = input.topicCard;
    const { error: cardErr } = await admin.from("topic_cards").upsert(
      {
        source_editorial_brief_id: tc.sourceEditorialBriefId,
        space_id: space.spaceId,
        working_title: tc.workingTitle,
        core_question: tc.coreQuestion,
        recommended_format: tc.recommendedFormat,
        format_label: tc.formatLabel,
        key_facts: tc.keyFacts,
        source_ids: tc.sourceIds,
        map_context: tc.mapContext,
        status: tc.status,
        owner_id: tc.ownerId,
        observation_dimensions: tc.observationDimensions,
      },
      { onConflict: "source_editorial_brief_id" },
    );
    if (cardErr) return { ok: false, reason: `topic_card: ${cardErr.message}` };
  }

  return { ok: true };
}

/**
 * Persist a topic-card claim/owner change. Identified by the source brief id (stable
 * across the in-memory `topic-<id>` vs DB-uuid split). ownerId = null releases it.
 */
export async function persistTopicCardOwner(
  sourceEditorialBriefId: string,
  ownerId: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  const admin = createSupabaseAdminClient();
  const space = await spaceForBrief(admin, sourceEditorialBriefId);
  if (!space.ok) return space;
  const { error } = await admin
    .from("topic_cards")
    .update({ owner_id: ownerId })
    .eq("source_editorial_brief_id", sourceEditorialBriefId);
  if (error) return { ok: false, reason: `claim: ${error.message}` };
  return { ok: true };
}

/**
 * Persist a new tracking object into a space. Membership is checked against the
 * RLS-scoped getMySpaces(); the write goes through the service-role client (content
 * tables have read-only RLS). Returns the new row id.
 */
export async function addTrackingObjectToSpace(spaceId: string, input: AddTrackingObjectInput) {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === spaceId)) throw new Error("forbidden");

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const createdBy = user.user?.id ?? null;
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("tracking_objects")
    .insert({
      space_id: spaceId,
      name: input.name?.trim() || input.nameZh,
      name_zh: input.nameZh,
      type: input.type,
      aliases: [],
      country_or_region: input.headquarters ?? "",
      official_url: null,
      primary_track: input.primaryTrack ?? "",
      why_track: input.whyTrack ?? "",
      keywords: input.keywords ?? [],
      excluded_terms: [],
      languages: [],
      regions: [],
      preferred_sources: [],
      search_frequency: "daily",
      priority: input.priority,
      created_at: now,
      updated_at: now,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { trackingObjectId: data.id as string };
}

/**
 * Hard-delete a tracking object the caller is allowed to remove. Authorization mirrors
 * canDeleteTrackingObject (creator, or space admin/owner) and is enforced HERE — the
 * client only uses it to decide whether to show the button. The DB's `on delete cascade`
 * removes the object's search runs, candidate signals, briefs and subscriptions.
 */
export async function deleteTrackingObject(spaceId: string, trackingObjectId: string): Promise<void> {
  const mine = await getMySpaces();
  const membership = mine.find((m) => m.space.id === spaceId);
  if (!membership) throw new Error("forbidden");

  const admin = createSupabaseAdminClient();
  const { data: obj, error } = await admin
    .from("tracking_objects")
    .select("id, space_id, created_by")
    .eq("id", trackingObjectId)
    .single();
  if (error || !obj) throw new Error("object_not_found");
  if (obj.space_id !== spaceId) throw new Error("forbidden");

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id ?? null;

  const allowed = canDeleteTrackingObject({
    createdBy: obj.created_by, userId, role: membership.role, isOwner: membership.isOwner,
  });
  if (!allowed) throw new Error("forbidden");

  const { error: delError } = await admin
    .from("tracking_objects")
    .delete()
    .eq("id", trackingObjectId)
    .eq("space_id", spaceId);
  if (delError) throw new Error(delError.message);
}
