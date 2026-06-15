import { AppFrame } from "@/components/workbench/app-frame";
import { MapModeView } from "@/components/workbench/views/map-mode-view";

export default function MapPage() {
  return (
    <AppFrame locale="en">
      <MapModeView locale="en" />
    </AppFrame>
  );
}
