import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { UsageDashboardView } from "@/components/workbench/views/usage-dashboard-view";
import { loadUsageDashboard } from "@/lib/usage/load-dashboard";

export default async function ChineseUsagePage() {
  const res = await loadUsageDashboard("zh");
  if (res.kind === "redirect") redirect(res.to);
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <UsageDashboardView locale="zh" data={res.data} renderedSpaceId={res.renderedSpaceId} />
      </AppFrame>
    </AccountShell>
  );
}
