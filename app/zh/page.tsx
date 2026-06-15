import { AppFrame } from "@/components/workbench/app-frame";
import { Workbench } from "@/components/workbench/workbench";

export default function ChineseHomePage() {
  return (
    <AppFrame locale="zh">
      <Workbench />
    </AppFrame>
  );
}
