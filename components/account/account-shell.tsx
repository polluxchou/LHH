import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { getMySpaces, getSessionUser, getSpaceMembers } from "@/lib/account/queries";
import { getSpaceContent, getSpaceSubscriptions } from "@/lib/account/content-queries";
import { resolveInitialSpaceId, SPACE_COOKIE } from "@/lib/account/resolve-space";
import { buildSpaceState } from "@/lib/workflow/build-space-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SpaceProvider } from "@/components/account/space-provider";
import { WorkflowProvider } from "@/components/workbench/workflow-provider";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";
import type { Profile, SpaceMember } from "@/lib/domain/account";

const DEMO_SPACE_NAME = "林哈哈聊太空";

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

  // Persisted space selection: an explicit `?space=` deep link wins, otherwise fall
  // back to the cookie written by the space switcher so switching views (each a
  // separate route that remounts SpaceProvider) doesn't snap the user back to mySpaces[0].
  const cookieSpace = (await cookies()).get(SPACE_COOKIE)?.value ?? null;
  const resolvedSpaceId = resolveInitialSpaceId(
    { explicit: initialSpaceId, cookie: cookieSpace },
    mySpaces.map((s) => s.space.id),
  );

  const supabase = await createSupabaseServerClient();
  const { data: prof } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  const profile: Profile | null = prof
    ? { id: prof.id, displayName: prof.display_name, avatarChar: prof.avatar_char, color: prof.color }
    : null;

  const membersBySpace: Record<string, SpaceMember[]> = {};
  const contentBySpace: Record<string, LocalWorkflowState> = {};
  for (const s of mySpaces) {
    const members = await getSpaceMembers(s.space.id);
    membersBySpace[s.space.id] = members;
    const dbContent = await getSpaceContent(s.space.id);
    const subscriptionsByUser = await getSpaceSubscriptions(s.space.id);
    contentBySpace[s.space.id] = buildSpaceState({
      dbContent, members, currentUserId: user.id, isDemoSpace: s.space.name === DEMO_SPACE_NAME, subscriptionsByUser,
    });
  }

  return (
    <SpaceProvider
      userId={user.id}
      email={user.email ?? ""}
      profile={profile}
      mySpaces={mySpaces}
      membersBySpace={membersBySpace}
      contentBySpace={contentBySpace}
      initialSpaceId={resolvedSpaceId ?? undefined}
    >
      <WorkflowProvider locale={locale}>{children}</WorkflowProvider>
    </SpaceProvider>
  );
}
