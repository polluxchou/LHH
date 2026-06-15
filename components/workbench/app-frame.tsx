"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@/lib/i18n/copy";
import { countUpcomingLaunches } from "@/lib/data/launches";
import { useWorkflow } from "@/components/workbench/workflow-provider";
import { getTotalPending } from "@/components/workbench/selectors";
import { TopNav } from "@/components/workbench/top-nav";
import { LogDrawer } from "@/components/workbench/log-drawer";
import { AddTrackedDialog } from "@/components/workbench/add-tracked-dialog";
import { TweaksPanel } from "@/components/workbench/tweaks-panel";

/**
 * Shared chrome for every page: masthead nav (badges + user switcher),
 * content area, terminal log drawer, add-object dialog, display tweaks.
 */
export function AppFrame({ locale, children }: { locale: Locale; children: ReactNode }) {
  const store = useWorkflow();
  const [logExpanded, setLogExpanded] = useState(false);
  const totalPending = useMemo(
    () => getTotalPending(store.state),
    [store.state],
  );

  return (
    <div className="app-shell">
      <TopNav
        locale={locale}
        badges={{ brief: totalPending, pool: store.state.topicCards.length, launch: countUpcomingLaunches(7) }}
      />

      {children}

      <LogDrawer
        logs={store.state.runLog}
        locale={locale}
        expanded={logExpanded}
        onToggle={() => setLogExpanded((value) => !value)}
      />

      <AddTrackedDialog
        open={store.addOpen}
        currentMember={store.currentMember}
        onClose={() => store.setAddOpen(false)}
        onAdd={store.addTracked}
      />

      <TweaksPanel tweaks={store.tweaks} onChange={store.setTweak} />
    </div>
  );
}
