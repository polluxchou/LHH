import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { Workbench } from "@/components/workbench/workbench";

// The「生成/重新生成简报」server actions (DeepSeek + x-search) invoked from this route are
// slow; give them the full Vercel Hobby budget so they finish instead of stalling out.
export const maxDuration = 60;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { space } = await searchParams;
  return (
    <AccountShell locale="en" initialSpaceId={space}>
      <AppFrame locale="en">
        <Workbench />
      </AppFrame>
    </AccountShell>
  );
}
