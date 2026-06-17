import type { Locale } from "@/lib/i18n/copy";
import type { TrackingObject } from "@/lib/domain/types";

/** The subset of add-object copy that adapts to the space's theme and objects. */
export interface AdaptiveAddFields {
  title: string;
  nameZhPlaceholder: string;
  nameEnPlaceholder: string;
  trackPlaceholder: string;
  hqPlaceholder: string;
  keywordsPlaceholder: string;
}

/** The static copy this helper draws from (the locale-resolved `dialogs.addTracked`). */
export interface AdaptiveAddBase extends AdaptiveAddFields {
  titleThemed: (theme: string) => string;
  egPrefix: string;
}

/**
 * Adapt the add-object dialog copy to the current space:
 *   - a non-empty `theme` is woven into the title;
 *   - once the space has real tracking objects, the placeholders become examples
 *     drawn from them (most-recently-updated first), so the hint matches what the
 *     team actually tracks.
 *
 * Anything not derivable (no theme / no objects / an empty field) falls back to the
 * static `base` copy. All locale text lives in `base` (from copy.ts); this helper only
 * orchestrates, so it never hardcodes Chinese/English and stays clear of the i18n guard.
 */
export function buildAdaptiveAddCopy(input: {
  base: AdaptiveAddBase;
  theme?: string | null;
  objects: TrackingObject[];
  /** reserved: locale-specific wording already lives in `base`; kept for future use */
  locale?: Locale;
}): AdaptiveAddFields {
  const { base, theme, objects } = input;
  const out: AdaptiveAddFields = {
    title: base.title,
    nameZhPlaceholder: base.nameZhPlaceholder,
    nameEnPlaceholder: base.nameEnPlaceholder,
    trackPlaceholder: base.trackPlaceholder,
    hqPlaceholder: base.hqPlaceholder,
    keywordsPlaceholder: base.keywordsPlaceholder,
  };

  const themeTrimmed = theme?.trim();
  if (themeTrimmed) {
    out.title = base.titleThemed(themeTrimmed);
  }

  if (objects.length > 0) {
    const recent = [...objects].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    const ex = recent[0];
    const p = base.egPrefix;

    const display = ex.nameZh?.trim() || ex.name?.trim();
    if (display) out.nameZhPlaceholder = `${p}${display}`;
    const en = ex.name?.trim();
    if (en && en !== display) out.nameEnPlaceholder = `${p}${en}`;
    if (ex.primaryTrack?.trim()) out.trackPlaceholder = `${p}${ex.primaryTrack.trim()}`;
    if (ex.countryOrRegion?.trim()) out.hqPlaceholder = `${p}${ex.countryOrRegion.trim()}`;

    const withKeywords = recent.find((o) => (o.keywords?.length ?? 0) > 0);
    if (withKeywords) out.keywordsPlaceholder = `${p}${withKeywords.keywords.slice(0, 4).join(", ")}`;
  }

  return out;
}
