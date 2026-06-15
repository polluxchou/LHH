import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { TrackedManageView } from "@/components/workbench/views/tracked-manage-view";

export default function ChineseTrackingObjectsPage() {
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <TrackedManageView locale="zh" />
      </AppFrame>
    </AccountShell>
  );
}
