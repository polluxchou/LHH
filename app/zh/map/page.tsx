import { AppFrame } from "@/components/workbench/app-frame";
import { MapModeView } from "@/components/workbench/views/map-mode-view";

export default function ChineseMapPage() {
  return (
    <AppFrame locale="zh">
      <MapModeView locale="zh" />
    </AppFrame>
  );
}
