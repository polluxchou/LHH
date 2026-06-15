import { AppFrame } from "@/components/workbench/app-frame";
import { LaunchScheduleView } from "@/components/workbench/views/launch-schedule-view";

export default function LaunchSchedulePage() {
  return (
    <AppFrame locale="en">
      <LaunchScheduleView locale="en" />
    </AppFrame>
  );
}
