import { AppFrame } from "@/components/workbench/app-frame";
import { BriefingsInboxView } from "@/components/workbench/views/briefings-inbox-view";

export default function ChineseBriefsPage() {
  return (
    <AppFrame locale="zh">
      <BriefingsInboxView locale="zh" />
    </AppFrame>
  );
}
