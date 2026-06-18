import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { Workbench } from "@/components/workbench/workbench";

// 同 app/page.tsx：给本路由触发的「生成/重新生成简报」server action 完整的 Hobby 时间预算。
export const maxDuration = 60;

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
