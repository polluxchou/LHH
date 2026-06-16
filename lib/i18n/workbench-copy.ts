import { getCopy, type InterfaceCopy, type Locale } from "@/lib/i18n/copy";

// Top-nav / masthead chrome now lives in the single dictionary (copy.ts → `shell`).
// This thin accessor is kept so existing consumers (top-nav, view-switcher) need
// no changes.
export type WorkbenchChrome = InterfaceCopy["shell"];

export function getWorkbenchChrome(locale: Locale): WorkbenchChrome {
  return getCopy(locale).shell;
}
