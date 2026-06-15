import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { Workbench } from "@/components/workbench/workbench";

export default async function ChineseHomePage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { space } = await searchParams;
  return (
    <AccountShell locale="zh" initialSpaceId={space}>
      <AppFrame locale="zh">
        <Workbench />
      </AppFrame>
    </AccountShell>
  );
}
