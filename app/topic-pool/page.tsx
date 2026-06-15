import { AppFrame } from "@/components/workbench/app-frame";
import { TopicPoolView } from "@/components/workbench/views/topic-pool-view";

export default function TopicPoolPage() {
  return (
    <AppFrame locale="en">
      <TopicPoolView locale="en" />
    </AppFrame>
  );
}
