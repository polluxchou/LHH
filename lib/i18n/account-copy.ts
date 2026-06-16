import { getCopy, type Locale } from "@/lib/i18n/copy";

// Account / onboarding chrome now lives in the single dictionary (copy.ts →
// `account`). Thin accessor kept for existing consumers (no-space pages).
export function getAccountCopy(locale: Locale) {
  return getCopy(locale).account;
}
