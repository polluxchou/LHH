"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getMySpaces } from "@/lib/account/queries";
import { ingestTrackingObject } from "@/lib/ingest/run";
import type { AddTrackingObjectInput } from "@/lib/workflow/local-workflow";

/**
 * On-demand real search for one tracking object: read its row (for space_id + brand
 * fields), check the caller is a member of that space, then run the real ingest
 * pipeline (Gemini → DeepSeek → write) via the service-role client. Returns the
 * writer's { wrote, reason } so the workbench can log "produced / not produced".
 */
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

/**
 * Persist a new tracking object into a space. Membership is checked against the
 * RLS-scoped getMySpaces(); the write goes through the service-role client (content
 * tables have read-only RLS). Returns the new row id.
 */
export async function addTrackingObjectToSpace(spaceId: string, input: AddTrackingObjectInput) {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === spaceId)) throw new Error("forbidden");

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
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { trackingObjectId: data.id as string };
}
