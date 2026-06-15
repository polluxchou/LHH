import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { TrackedManageView } from "@/components/workbench/views/tracked-manage-view";

export default function TrackingObjectsPage() {
  return (
    <AccountShell locale="en">
      <AppFrame locale="en">
        <TrackedManageView locale="en" />
      </AppFrame>
    </AccountShell>
  );
}
