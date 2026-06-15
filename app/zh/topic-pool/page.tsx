import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { TopicPoolView } from "@/components/workbench/views/topic-pool-view";

export default function ChineseTopicPoolPage() {
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <TopicPoolView locale="zh" />
      </AppFrame>
    </AccountShell>
  );
}
