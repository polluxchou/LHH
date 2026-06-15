import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { createSupabaseJobStore, enqueueDailyJobs, utcRunDate } from "@/lib/ingest/jobs";
import { authorizeIngest, kickWorkers } from "@/lib/ingest/worker-trigger";

export const maxDuration = 60;

async function handle(req: Request): Promise<Response> {
  if (!authorizeIngest(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getServiceClient();
  const store = createSupabaseJobStore(db);
  const runDate = utcRunDate(new Date());
  const enqueued = await enqueueDailyJobs(store, { runDate });

  // 踢 K 条并行 worker 链;kicked 是**实际**触发数(NEXT_PUBLIC_SITE_URL 缺失则为 0,见 kickWorkers)。
  const K = Number(process.env.INGEST_WORKER_CONCURRENCY ?? "4");
  const kicked = kickWorkers(K);

  return NextResponse.json({ runDate, enqueued, kicked });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
