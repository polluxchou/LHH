import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getMySpaces, getSessionUser, getSpaceMembers } from "@/lib/account/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SpaceProvider } from "@/components/account/space-provider";
import { WorkflowProvider } from "@/components/workbench/workflow-provider";
import type { Profile, SpaceMember } from "@/lib/domain/account";

export async function AccountShell({
  locale, initialSpaceId, children,
}: {
  locale: "en" | "zh";
  initialSpaceId?: string;
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect(locale === "zh" ? "/zh/login" : "/login");

  const mySpaces = await getMySpaces();
  if (mySpaces.length === 0) redirect(locale === "zh" ? "/zh/no-space" : "/no-space");

  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const profile: Profile | null = prof
    ? { id: prof.id, displayName: prof.display_name, avatarChar: prof.avatar_char, color: prof.color }
    : null;

  const membersBySpace: Record<string, SpaceMember[]> = {};
  for (const s of mySpaces) membersBySpace[s.space.id] = await getSpaceMembers(s.space.id);

  return (
    <SpaceProvider
      userId={user.id}
      email={user.email ?? ""}
      profile={profile}
      mySpaces={mySpaces}
      membersBySpace={membersBySpace}
      initialSpaceId={initialSpaceId}
    >
      <WorkflowProvider>{children}</WorkflowProvider>
    </SpaceProvider>
  );
}
