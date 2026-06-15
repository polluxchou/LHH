import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { createSupabaseJobStore, enqueueDailyJobs, utcRunDate } from "@/lib/ingest/jobs";

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

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getServiceClient();
  const store = createSupabaseJobStore(db);
  const runDate = utcRunDate(new Date());
  const enqueued = await enqueueDailyJobs(store, { runDate });

  // 踢 K 条并行 worker 链(fire-and-forget)
  const K = Number(process.env.INGEST_WORKER_CONCURRENCY ?? "4");
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const secret = process.env.INGEST_SECRET ?? "";
  for (let i = 0; i < K; i++) {
    void fetch(`${base}/api/ingest/worker`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    }).catch(() => {});
  }

  return NextResponse.json({ runDate, enqueued, kicked: K });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
