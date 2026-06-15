import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { Workbench } from "@/components/workbench/workbench";

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
