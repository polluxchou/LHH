import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { LaunchScheduleView } from "@/components/workbench/views/launch-schedule-view";

export default function LaunchSchedulePage() {
  return (
    <AccountShell locale="en">
      <AppFrame locale="en">
        <LaunchScheduleView locale="en" />
      </AppFrame>
    </AccountShell>
  );
}
