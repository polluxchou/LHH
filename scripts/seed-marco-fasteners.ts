import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fid } from "../lib/workflow/fixture-ids.ts";

// Seeds the "Mr.Marco" space (全球紧固件行业咨询) with real, web-researched
// fastener-industry tracking objects + candidate signals. Idempotent: stable
// fid()-derived ids mean re-runs upsert instead of duplicating. Scoped strictly
// to the Mr.Marco space — never touches 林哈哈聊太空.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SPACE_NAME = "Mr.Marco";
const RUN_DATE = "2026-06-15";
const NOW = "2026-06-15T10:30:00.000Z";

const signalTypeByKind = {
  milestone: "technical_project_milestone",
  facility: "location_facility_change",
  policy: "policy_regulatory_change",
} as const;

interface SourceSeed { url: string; title: string; publisher: string; publishedAt: string; sourceType: string; }
interface SignalSeed { kind: keyof typeof signalTypeByKind; headline: string; summary: string; date: string; confidence: number; sources: SourceSeed[]; }
interface ObjectSeed {
  key: string; name: string; nameZh: string; type: string; aliases: string[];
  countryOrRegion: string; officialUrl: string; primaryTrack: string; whyTrack: string;
  keywords: string[]; languages: string[]; regions: string[]; priority: number; signals: SignalSeed[];
}

function toTs(dateOnly: string): string {
  return `${dateOnly}T00:00:00.000Z`;
}

async function upsert(table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (rows.length === 0) return;
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table} upsert: ${error.message}`);
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const data: ObjectSeed[] = JSON.parse(readFileSync(join(here, "marco-fasteners.json"), "utf8"));

  const { data: space, error: spErr } = await admin.from("spaces").select("id, name").eq("name", SPACE_NAME).single();
  if (spErr || !space) throw new Error(`space "${SPACE_NAME}" not found: ${spErr?.message}`);
  const spaceId = space.id as string;

  const trackRows: Record<string, unknown>[] = [];
  const runRows: Record<string, unknown>[] = [];
  const signalRows: Record<string, unknown>[] = [];
  const sourceRowsByUrl = new Map<string, Record<string, unknown>>();
  const srcId = (url: string) => fid(`marco-src-${url}`);

  for (const o of data) {
    const objId = fid(`marco-obj-${o.key}`);
    const runId = fid(`marco-run-${o.key}`);

    trackRows.push({
      id: objId, space_id: spaceId, name: o.name, name_zh: o.nameZh, type: o.type,
      aliases: o.aliases, country_or_region: o.countryOrRegion, official_url: o.officialUrl,
      primary_track: o.primaryTrack, why_track: o.whyTrack, keywords: o.keywords,
      excluded_terms: [], languages: o.languages, regions: o.regions,
      preferred_sources: ["official", "trade_media", "authoritative_media"],
      search_frequency: "daily", priority: o.priority, created_at: NOW, updated_at: NOW,
    });

    runRows.push({
      id: runId, space_id: spaceId, tracking_object_id: objId, run_date: RUN_DATE,
      query_set: o.keywords.slice(0, 5), status: "completed",
      result_count: o.signals.length, new_signal_count: o.signals.length, error_summary: null,
    });

    o.signals.forEach((s, i) => {
      for (const src of s.sources) {
        if (!sourceRowsByUrl.has(src.url)) {
          sourceRowsByUrl.set(src.url, {
            id: srcId(src.url), url: src.url, title: src.title, publisher: src.publisher,
            published_at: toTs(src.publishedAt), retrieved_at: NOW, source_type: src.sourceType,
            confidence: 0.85, notes: null,
          });
        }
      }
      signalRows.push({
        id: fid(`marco-sig-${o.key}-${i}`), space_id: spaceId, tracking_object_id: objId,
        search_run_id: runId, signal_type: signalTypeByKind[s.kind], headline: s.headline,
        summary: s.summary, event_date: s.date, detected_at: NOW,
        source_ids: s.sources.map((src) => srcId(src.url)), dedupe_key: `marco-${o.key}-${i}`,
        novelty_status: "new", confidence: s.confidence,
      });
    });
  }

  const sourceRows = [...sourceRowsByUrl.values()];

  await upsert("tracking_objects", trackRows, "id");
  await upsert("sources", sourceRows, "id");
  await upsert("search_runs", runRows, "id");
  await upsert("candidate_signals", signalRows, "id");

  console.log(`✅ Seeded Mr.Marco space (${spaceId}):`);
  console.log(`   tracking_objects=${trackRows.length} sources=${sourceRows.length} search_runs=${runRows.length} candidate_signals=${signalRows.length}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });
