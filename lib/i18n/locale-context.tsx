"use client";

import { createContext, useContext, type ReactNode } from "react";
import { getCopy, type InterfaceCopy, type Locale } from "@/lib/i18n/copy";

/**
 * Carries the active locale to every client component beneath AppFrame, so the
 * workbench and its panels/dialogs can read localized UI copy without prop
 * drilling. Server pages already know the locale and pass it to AppFrame, which
 * mounts this provider.
 */
const LocaleContext = createContext<Locale>("en");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Current locale ("en" | "zh"). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** The full UI copy dictionary for the active locale. */
export function useCopy(): InterfaceCopy {
  return getCopy(useLocale());
}
