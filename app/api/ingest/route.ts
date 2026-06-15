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
  if (error) {
    console.error("ingest: load tracking_objects failed", error.message);
    return NextResponse.json({ error: "failed to load tracking objects" }, { status: 500 });
  }

  // 跨运行去重：加载已入库 source url（canonical），分析前剔除已处理过的。
  const seenCanonicalUrls = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: pErr } = await db
      .from("sources")
      .select("url")
      .range(from, from + PAGE - 1);
    if (pErr) break;
    for (const r of page ?? []) seenCanonicalUrls.add(canonicalizeUrl(r.url as string));
    if (!page || page.length < PAGE) break;
  }

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
          search: (brand, since, today, keywords, excludedTerms) =>
            searchRecentNews({ brand, sinceDate: since, todayDate: today, keywords, excludedTerms }),
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
