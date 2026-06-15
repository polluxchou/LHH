import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { runIngestForBrand } from "@/lib/ingest/pipeline";
import { searchRecentNews } from "@/lib/ingest/gemini-search";
import { analyzeBrief } from "@/lib/ingest/deepseek-analyze";
import { writeIngestResult } from "@/lib/db/ingest-writer";
import { canonicalizeUrl } from "@/lib/search/dedupe";

export const maxDuration = 300;

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const ingest = process.env.INGEST_SECRET;
  const cron = process.env.CRON_SECRET;
  return (
    (!!ingest && auth === `Bearer ${ingest}`) ||
    (!!cron && auth === `Bearer ${cron}`)
  );
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: brands, error } = await db
    .from("tracking_objects")
    .select("id, name, aliases, keywords, excluded_terms, languages, regions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 跨运行去重：加载已入库 source url（canonical），分析前剔除已处理过的。
  const { data: seenRows } = await db.from("sources").select("url");
  const seenCanonicalUrls = new Set(
    (seenRows ?? []).map((r) => canonicalizeUrl(r.url as string)),
  );

  const now = new Date().toISOString();
  const summary: { brand: string; wrote: boolean; reason?: string }[] = [];

  for (const b of brands ?? []) {
    try {
      const result = await runIngestForBrand(
        {
          id: b.id, name: b.name, aliases: b.aliases ?? [],
          keywords: b.keywords ?? [], excludedTerms: b.excluded_terms ?? [],
          languages: b.languages ?? [], regions: b.regions ?? [],
        },
        {
          now,
          windowDays: 7,
          seenCanonicalUrls,
          search: (brand, since, today) =>
            searchRecentNews({ brand, sinceDate: since, todayDate: today }),
          analyze: (brand, items) => analyzeBrief({ brand, items }),
        },
      );
      const w = await writeIngestResult(db, result);
      summary.push({ brand: b.name, wrote: w.wrote, reason: w.reason });
    } catch (e) {
      summary.push({ brand: b.name, wrote: false, reason: (e as Error).message });
    }
  }

  return NextResponse.json({ ran: summary.length, summary });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
