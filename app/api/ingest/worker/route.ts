import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { createSupabaseJobStore, claimNextJob, completeJob, failJob, utcRunDate } from "@/lib/ingest/jobs";
import { ingestTrackingObject, type IngestBrandInput } from "@/lib/ingest/run";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const ingest = process.env.INGEST_SECRET;
  const cron = process.env.CRON_SECRET;
  return (
    (!!ingest && auth === `Bearer ${ingest}`) ||
    (!!cron && auth === `Bearer ${cron}`)
  );
}

function selfInvoke(): void {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const secret = process.env.INGEST_SECRET ?? "";
  void fetch(`${base}/api/ingest/worker`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  }).catch(() => {});
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
  if (remaining > 0) selfInvoke();

  return NextResponse.json({ processed: true, jobId: job.id, remaining });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
