import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { MapModeView } from "@/components/workbench/views/map-mode-view";

export default function ChineseMapPage() {
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <MapModeView locale="zh" />
      </AppFrame>
    </AccountShell>
  );
}
