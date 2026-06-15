import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { BriefingsInboxView } from "@/components/workbench/views/briefings-inbox-view";

export default function ChineseBriefsPage() {
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <BriefingsInboxView locale="zh" />
      </AppFrame>
    </AccountShell>
  );
}
