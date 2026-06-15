import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAccountCopy } from "@/lib/i18n/account-copy";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";

export default async function NoSpacePage() {
  const copy = getAccountCopy("en");
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: app } = user.user
    ? await supabase.from("applications").select("id").eq("owner_id", user.user.id).maybeSingle()
    : { data: null };
  return (
    <main className="account-page no-space">
      <h1>{copy.noSpaceTitle}</h1>
      {app ? (
        <>
          <p>{copy.noSpaceOwner}</p>
          <CreateSpaceDialog locale="en" />
        </>
      ) : (
        <p>{copy.noSpaceWaiting}</p>
      )}
    </main>
  );
}
