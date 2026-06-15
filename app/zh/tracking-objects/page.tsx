import { AppFrame } from "@/components/workbench/app-frame";
import { TrackedManageView } from "@/components/workbench/views/tracked-manage-view";

export default function ChineseTrackingObjectsPage() {
  return (
    <AppFrame locale="zh">
      <TrackedManageView locale="zh" />
    </AppFrame>
  );
}
