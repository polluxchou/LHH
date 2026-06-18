import { cookies } from "next/headers";
import { getMySpaces, getSessionUser } from "@/lib/account/queries";
import { resolveInitialSpaceId, SPACE_COOKIE } from "@/lib/account/resolve-space";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildDashboard, type UsageDashboardData, type UsageScope } from "@/lib/usage/dashboard";
import type { UsageRow } from "@/lib/usage/aggregate";

export type LoadUsageResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; data: UsageDashboardData; renderedSpaceId: string };

/**
 * 解析会话 + 当前空间 + 角色,做访问门(普通成员重定向),再按 RLS 取 usage_logs,
 * 交给纯函数塑形。读取一律走 RLS 客户端,绝不用 service-role。
 */
export async function loadUsageDashboard(locale: "en" | "zh"): Promise<LoadUsageResult> {
  const home = locale === "zh" ? "/zh" : "/";
  const user = await getSessionUser();
  if (!user) return { kind: "redirect", to: locale === "zh" ? "/zh/login" : "/login" };

  const mySpaces = await getMySpaces();
  if (mySpaces.length === 0) return { kind: "redirect", to: locale === "zh" ? "/zh/no-space" : "/no-space" };

  const cookieSpace = (await cookies()).get(SPACE_COOKIE)?.value ?? null;
  const spaceId = resolveInitialSpaceId({ cookie: cookieSpace }, mySpaces.map((s) => s.space.id));
  const current = spaceId ? mySpaces.find((s) => s.space.id === spaceId) : undefined;
  if (!spaceId || !current) return { kind: "redirect", to: home };

  const isOwner = current.isOwner;
  const isAdmin = current.role === "admin";
  if (!isOwner && !isAdmin) return { kind: "redirect", to: home };

  const scope: UsageScope = isOwner ? { kind: "owner" } : { kind: "space", spaceId };

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("usage_logs")
    .select("space_id, provider, model, operation, total_tokens, cost_usd, created_at");
  // 管理员(非所有者)显式按当前空间过滤;所有者不过滤,由 RLS(is_space_owner)给名下全部。
  if (!isOwner) query = query.eq("space_id", spaceId);
  const { data: rowData } = await query;
  const rows = (rowData ?? []) as UsageRow[];

  // 所有者视角:为 by-space 表补空间名(同样走 RLS 客户端)。
  const spaceNames: Record<string, string> = {};
  if (isOwner) {
    const ids = [...new Set(rows.map((r) => r.space_id).filter((x): x is string => !!x))];
    if (ids.length > 0) {
      const { data: spaceData } = await supabase.from("spaces").select("id, name").in("id", ids);
      for (const sp of (spaceData ?? []) as { id: string; name: string }[]) spaceNames[sp.id] = sp.name;
    }
  }

  const data = buildDashboard(rows, { scope, spaceNames });
  return { kind: "ok", data, renderedSpaceId: spaceId };
}
