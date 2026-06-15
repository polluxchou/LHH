import Link from "next/link";
import { redirect } from "next/navigation";
import { getMySpaces, getSpaceMembers } from "@/lib/account/queries";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";

export default async function SpacesPage() {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.isOwner)) redirect("/");
  const owned = mine.filter((m) => m.isOwner);
  const rows = await Promise.all(owned.map(async (m) => ({ m, count: (await getSpaceMembers(m.space.id)).length })));
  return (
    <main className="account-page">
      <div className="account-page-head">
        <Link href="/" className="link-btn">← Workbench</Link>
        <h1>All spaces</h1>
      </div>
      <ul className="spaces-list">
        {rows.map(({ m, count }) => (
          <li key={m.space.id} className="space-card">
            <div className="space-card-main">
              <Link href={`/?space=${m.space.id}`} className="space-card-name">{m.space.name}</Link>
              <span className="space-card-theme">{m.space.theme}</span>
            </div>
            <span className="space-card-count">{count} members</span>
            <Link href={`/space/members?space=${m.space.id}`} className="link-btn">Manage</Link>
          </li>
        ))}
      </ul>
      <h2>New space</h2>
      <CreateSpaceDialog locale="en" />
    </main>
  );
}
