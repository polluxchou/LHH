import type { Source } from "@/lib/domain/types";
import { canonicalizeUrl, dedupeByCanonicalUrl } from "@/lib/search/dedupe";

export interface MockSearchResult {
  url: string;
  title: string;
  publisher?: string | null;
  publishedAt?: string | null;
  retrievedAt?: string | null;
  sourceType?: Source["sourceType"];
  confidence?: number;
  notes?: string | null;
}

function sourceIdFromUrl(url: string): string {
  return `source-${canonicalizeUrl(url).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLocaleLowerCase()}`;
}

export function normalizeSearchResult(result: MockSearchResult, retrievedAt: string): Source {
  return {
    id: sourceIdFromUrl(result.url),
    url: result.url,
    title: result.title.trim(),
    publisher: result.publisher?.trim() || null,
    publishedAt: result.publishedAt ?? null,
    retrievedAt: result.retrievedAt ?? retrievedAt,
    sourceType: result.sourceType ?? "other",
    confidence: result.confidence ?? 0.6,
    notes: result.notes ?? null,
  };
}

export function normalizeSearchResults(results: readonly MockSearchResult[], retrievedAt: string): Source[] {
  return dedupeByCanonicalUrl(results).map((result) => normalizeSearchResult(result, retrievedAt));
}
