import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { LaunchScheduleView } from "@/components/workbench/views/launch-schedule-view";

export default function ChineseLaunchSchedulePage() {
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <LaunchScheduleView locale="zh" />
      </AppFrame>
    </AccountShell>
  );
}
