import { AppFrame } from "@/components/workbench/app-frame";
import { BriefingsInboxView } from "@/components/workbench/views/briefings-inbox-view";

export default function BriefInboxPage() {
  return (
    <AppFrame locale="en">
      <BriefingsInboxView locale="en" />
    </AppFrame>
  );
}
