const TRACKING_QUERY_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

function normalizePath(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const host = url.hostname.toLocaleLowerCase();
  const path = normalizePath(url.pathname);
  const params = new URLSearchParams();

  for (const [key, value] of url.searchParams.entries()) {
    const normalizedKey = key.toLocaleLowerCase();

    if (!TRACKING_QUERY_PARAMS.has(normalizedKey) && value.trim()) {
      params.append(normalizedKey, value);
    }
  }

  params.sort();

  const query = params.toString();
  return `${host}${path === "/" ? "" : path}${query ? `?${query}` : ""}`;
}

export function dedupeByCanonicalUrl<T extends { url: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = canonicalizeUrl(item.url);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function dedupeByTrackingObjectKey<T extends { trackingObjectId: string; dedupeKey: string }>(
  items: readonly T[],
): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const key = `${item.trackingObjectId}:${item.dedupeKey}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
