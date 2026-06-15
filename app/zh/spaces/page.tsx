import Link from "next/link";
import { redirect } from "next/navigation";
import { getMySpaces, getSpaceMembers } from "@/lib/account/queries";
import { CreateSpaceDialog } from "@/components/account/create-space-dialog";

export default async function ZhSpacesPage() {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.isOwner)) redirect("/zh");
  const owned = mine.filter((m) => m.isOwner);
  const rows = await Promise.all(owned.map(async (m) => ({ m, count: (await getSpaceMembers(m.space.id)).length })));
  return (
    <main className="account-page">
      <div className="account-page-head">
        <Link href="/zh" className="link-btn">← 工作台</Link>
        <h1>全部空间</h1>
      </div>
      <ul className="spaces-list">
        {rows.map(({ m, count }) => (
          <li key={m.space.id} className="space-card">
            <div className="space-card-main">
              <Link href={`/zh/?space=${m.space.id}`} className="space-card-name">{m.space.name}</Link>
              <span className="space-card-theme">{m.space.theme}</span>
            </div>
            <span className="space-card-count">{count} 名成员</span>
            <Link href={`/zh/space/members?space=${m.space.id}`} className="link-btn">管理</Link>
          </li>
        ))}
      </ul>
      <h2>新建空间</h2>
      <CreateSpaceDialog locale="zh" />
    </main>
  );
}
