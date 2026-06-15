import Link from "next/link";
import { redirect } from "next/navigation";
import { getMySpaces } from "@/lib/account/queries";
import { MemberPanel } from "@/components/account/member-panel";

export default async function ZhMembersPage({ searchParams }: { searchParams: Promise<{ space?: string }> }) {
  const { space } = await searchParams;
  const mine = await getMySpaces();
  if (mine.length === 0) redirect("/zh/no-space");
  const target = mine.find((m) => m.space.id === space) ?? mine[0];
  return (
    <main className="account-page">
      <div className="account-page-head">
        <Link href={`/zh/?space=${target.space.id}`} className="link-btn">← 工作台</Link>
        <h1>{target.space.name}</h1>
      </div>
      <MemberPanel spaceId={target.space.id} actorRole={target.role} isOwner={target.isOwner} locale="zh" />
    </main>
  );
}
