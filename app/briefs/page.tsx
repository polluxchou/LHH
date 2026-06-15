import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { BriefingsInboxView } from "@/components/workbench/views/briefings-inbox-view";

export default function BriefInboxPage() {
  return (
    <AccountShell locale="en">
      <AppFrame locale="en">
        <BriefingsInboxView locale="en" />
      </AppFrame>
    </AccountShell>
  );
}
