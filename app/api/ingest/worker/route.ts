import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { createSupabaseJobStore, claimNextJob, completeJob, failJob, utcRunDate } from "@/lib/ingest/jobs";
import { ingestTrackingObject, type IngestBrandInput } from "@/lib/ingest/run";
import { authorizeIngest, kickWorkers } from "@/lib/ingest/worker-trigger";

export const maxDuration = 60;

async function handle(req: Request): Promise<Response> {
  if (!authorizeIngest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getServiceClient();
  const store = createSupabaseJobStore(db);
  const runDate = utcRunDate(new Date());
  const maxAttempts = Number(process.env.INGEST_MAX_ATTEMPTS ?? "3");

  const job = await claimNextJob(store, { runDate, maxAttempts });
  if (!job) return NextResponse.json({ processed: false, reason: "no_pending" });

  try {
    const { data, error } = await db
      .from("tracking_objects")
      .select("id, space_id, name, aliases, keywords, excluded_terms, languages, regions")
      .eq("id", job.tracking_object_id)
      .maybeSingle();
    if (error || !data) throw new Error(`load tracking_object: ${error?.message ?? "not found"}`);

    const brand: IngestBrandInput = {
      id: data.id as string,
      spaceId: data.space_id as string,
      name: data.name as string,
      aliases: (data.aliases as string[]) ?? [],
      keywords: (data.keywords as string[]) ?? [],
      excludedTerms: (data.excluded_terms as string[]) ?? [],
      languages: (data.languages as string[]) ?? [],
      regions: (data.regions as string[]) ?? [],
    };
    const result = await ingestTrackingObject(db, brand);
    await completeJob(store, job, { wrote: result.wrote });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "worker error";
    await failJob(store, job, { error: reason, maxAttempts });
  }

  const remaining = await store.countPending(runDate, maxAttempts);
  if (remaining > 0) kickWorkers(1);

  return NextResponse.json({ processed: true, jobId: job.id, remaining });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
