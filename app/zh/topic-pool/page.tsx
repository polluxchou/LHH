import { AppFrame } from "@/components/workbench/app-frame";
import { TopicPoolView } from "@/components/workbench/views/topic-pool-view";

export default function ChineseTopicPoolPage() {
  return (
    <AppFrame locale="zh">
      <TopicPoolView locale="zh" />
    </AppFrame>
  );
}
