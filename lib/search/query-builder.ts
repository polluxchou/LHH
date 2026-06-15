import type { TrackingObject } from "@/lib/domain/types";

function uniqueClean(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase();

    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(normalized);
  }

  return cleaned;
}

function quoteTerm(value: string): string {
  return value.includes(" ") ? `"${value}"` : value;
}

function formatKeywordGroup(keywords: readonly string[]): string | null {
  if (keywords.length === 0) {
    return null;
  }

  return `(${keywords.map((keyword) => `"${keyword}"`).join(" OR ")})`;
}

export function buildTrackingObjectQueries(trackingObject: TrackingObject): string[] {
  const identities = uniqueClean([trackingObject.name, ...trackingObject.aliases]);
  const keywords = uniqueClean(trackingObject.keywords);
  const excludedTerms = uniqueClean(trackingObject.excludedTerms);
  const languages = uniqueClean(trackingObject.languages);
  const regions = uniqueClean(trackingObject.regions);
  const keywordGroup = formatKeywordGroup(keywords);

  return identities.map((identity) => {
    const parts = [
      `"${identity}"`,
      keywordGroup,
      ...languages.map((language) => `lang:${language}`),
      ...regions.map((region) => `region:"${region}"`),
      ...excludedTerms.map((term) => `-${quoteTerm(term)}`),
    ].filter((part): part is string => Boolean(part));

    return parts.join(" ");
  });
}
