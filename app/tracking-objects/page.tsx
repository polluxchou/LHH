import { AppFrame } from "@/components/workbench/app-frame";
import { TrackedManageView } from "@/components/workbench/views/tracked-manage-view";

export default function TrackingObjectsPage() {
  return (
    <AppFrame locale="en">
      <TrackedManageView locale="en" />
    </AppFrame>
  );
}
