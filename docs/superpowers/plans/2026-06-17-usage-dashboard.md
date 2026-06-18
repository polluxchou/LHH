# Token 用量仪表盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/usage`(+`/zh/usage`)仪表盘,让空间管理员看本空间、应用所有者看名下全部空间的 AI token 用量与成本。

**Architecture:** 纯函数 `buildDashboard` 负责聚合塑形(可单测);server 端 `loadUsageDashboard` 做会话/角色门 + RLS 取数;client `UsageDashboardView` 纯展示。读取走 RLS 客户端(`createSupabaseServerClient`),不绕权限。文案全部走 `lib/i18n/copy.ts`(en/zh)。

**Tech Stack:** Next.js 15 App Router、TypeScript、Supabase(`@supabase/ssr` RLS 客户端)、Vitest。复用既有 `lib/usage/*` 数据层、`vv-*` 视图样式、`useCopy`/`useSpaceSession`。

---

## 关联文档
- 设计 spec:`docs/superpowers/specs/2026-06-17-usage-dashboard-design.md`
- PRD:`docs/product/2026-06-17-usage-dashboard-prd.md`

## 权限语义(实现须严格遵守)
- 普通成员(role=member,非所有者)→ `loadUsageDashboard` 返回 redirect 首页;账户菜单不显示入口。
- 空间管理员(role=admin,非所有者)→ scope=`{kind:"space",spaceId:当前空间}`,查询 `.eq("space_id", spaceId)`,无 by-space。
- 应用所有者(isOwner)→ scope=`{kind:"owner"}`,不加 space 过滤(RLS 自动给名下全部),展示 by-space 表 + 合计行。

## File Structure
- 修改 `lib/usage/aggregate.ts` — `UsageRow` 加 `space_id`;`GroupDim` 加 `"space"`。
- 新建 `lib/usage/dashboard.ts` — 纯函数 `buildDashboard` + 类型。
- 新建 `lib/usage/load-dashboard.ts` — server 取数 + 角色门(薄层)。
- 新建 `app/usage/page.tsx`、`app/zh/usage/page.tsx` — server page。
- 新建 `components/workbench/views/usage-dashboard-view.tsx` — client 展示。
- 修改 `components/account/account-menu.tsx` — 角色门控的 `/usage` 入口。
- 修改 `lib/i18n/copy.ts` — `views.usage` 命名空间(en/zh)+ `account.usageLink`。
- 修改 `app/globals.css` — 仪表盘卡片/区块样式。
- 修改 `tests/usage/aggregate.test.ts`;新建 `tests/usage/dashboard.test.ts`。

---

### Task 1: aggregate.ts 增加 `space` 维度

**Files:**
- Modify: `lib/usage/aggregate.ts`
- Test: `tests/usage/aggregate.test.ts`

- [ ] **Step 1: 更新测试(先让它失败)**

把 `tests/usage/aggregate.test.ts` 整体替换为(给每行加 `space_id`,新增 space 分组用例):

```ts
import { describe, it, expect } from "vitest";
import { aggregateRows, type UsageRow } from "@/lib/usage/aggregate";

const rows: UsageRow[] = [
  { space_id: "s1", provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 100, cost_usd: 0.01, created_at: "2026-06-16T01:00:00Z" },
  { space_id: "s1", provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 200, cost_usd: 0.02, created_at: "2026-06-16T05:00:00Z" },
  { space_id: "s2", provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", total_tokens: 50, cost_usd: null, created_at: "2026-06-16T02:00:00Z" },
];

describe("aggregateRows", () => {
  it("groups by provider and sums tokens + cost (null cost treated as 0)", () => {
    const out = aggregateRows(rows, ["provider"]);
    const ds = out.find((g) => g.key.provider === "deepseek");
    expect(ds).toMatchObject({ totalTokens: 300, totalCostUsd: 0.03, calls: 2 });
    const gm = out.find((g) => g.key.provider === "gemini");
    expect(gm).toMatchObject({ totalTokens: 50, totalCostUsd: 0, calls: 1 });
  });

  it("groups by provider + day", () => {
    const out = aggregateRows(rows, ["provider", "day"]);
    const ds = out.find((g) => g.key.provider === "deepseek" && g.key.day === "2026-06-16");
    expect(ds?.calls).toBe(2);
  });

  it("groups by space", () => {
    const out = aggregateRows(rows, ["space"]);
    const s1 = out.find((g) => g.key.space === "s1");
    const s2 = out.find((g) => g.key.space === "s2");
    expect(s1).toMatchObject({ totalTokens: 300, totalCostUsd: 0.03, calls: 2 });
    expect(s2).toMatchObject({ totalTokens: 50, totalCostUsd: 0, calls: 1 });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/usage/aggregate.test.ts`
Expected: FAIL —— 类型错误(`space_id` 不在 `UsageRow`)或 `space` 不在 `GroupDim`。

- [ ] **Step 3: 改 `lib/usage/aggregate.ts`**

把 `UsageRow` 接口加一行 `space_id`,`GroupDim` 加 `"space"`,`dimValue` 处理 `"space"`:

```ts
export interface UsageRow {
  space_id: string | null;
  provider: Provider;
  model: string;
  operation: UsageOperation;
  total_tokens: number;
  cost_usd: number | null;
  created_at: string;
}

export type GroupDim = "provider" | "model" | "operation" | "day" | "space";

function dimValue(row: UsageRow, dim: GroupDim): string {
  if (dim === "day") return row.created_at.slice(0, 10);
  if (dim === "space") return row.space_id ?? "";
  return String(row[dim]);
}
```

(其余 `aggregateRows` 函数体不变。)

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/usage/aggregate.test.ts`
Expected: PASS(3 个用例)。

- [ ] **Step 5: 确认无其它编译破坏**

Run: `npx tsc --noEmit`
Expected: 0 错误(若 `record.ts`/其它处构造 `UsageRow` 报缺 `space_id`,在那里补 `space_id`;现有调用方应不直接构造该类型)。

- [ ] **Step 6: Commit**

```bash
git add lib/usage/aggregate.ts tests/usage/aggregate.test.ts
git commit -m "feat(usage): add space dimension to aggregateRows"
```

---

### Task 2: `buildDashboard` 纯函数

**Files:**
- Create: `lib/usage/dashboard.ts`
- Test: `tests/usage/dashboard.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `tests/usage/dashboard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDashboard } from "@/lib/usage/dashboard";
import type { UsageRow } from "@/lib/usage/aggregate";

const rows: UsageRow[] = [
  { space_id: "s1", provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 100, cost_usd: 0.01, created_at: "2026-06-16T01:00:00Z" },
  { space_id: "s1", provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", total_tokens: 50, cost_usd: null, created_at: "2026-06-16T02:00:00Z" },
  { space_id: "s2", provider: "deepseek", model: "deepseek-v4-flash", operation: "production", total_tokens: 200, cost_usd: 0.05, created_at: "2026-06-16T03:00:00Z" },
];

describe("buildDashboard", () => {
  it("returns zeroed totals + empty tables for no rows", () => {
    const d = buildDashboard([], { scope: { kind: "space", spaceId: "s1" }, spaceNames: {} });
    expect(d.totals).toEqual({ totalCostUsd: 0, totalTokens: 0, calls: 0, hasUnpricedRows: false });
    expect(d.byProviderModel).toEqual([]);
    expect(d.bySpace).toBeNull();
  });

  it("space scope: sums totals, builds provider/model rows desc by cost, no bySpace", () => {
    const d = buildDashboard(rows, { scope: { kind: "space", spaceId: "s1" }, spaceNames: {} });
    expect(d.totals.totalTokens).toBe(350);
    expect(d.totals.totalCostUsd).toBeCloseTo(0.06, 10);
    expect(d.totals.calls).toBe(3);
    expect(d.totals.hasUnpricedRows).toBe(true);
    expect(d.byProviderModel[0]).toMatchObject({ provider: "deepseek", model: "deepseek-v4-flash", calls: 2 });
    expect(d.byProviderModel[0].costUsd).toBeCloseTo(0.06, 10);
    expect(d.bySpace).toBeNull();
  });

  it("owner scope: builds bySpace with names, falls back to id when name missing", () => {
    const d = buildDashboard(rows, { scope: { kind: "owner" }, spaceNames: { s1: "Alpha" } });
    expect(d.bySpace).not.toBeNull();
    const s1 = d.bySpace!.find((r) => r.spaceId === "s1");
    const s2 = d.bySpace!.find((r) => r.spaceId === "s2");
    expect(s1).toMatchObject({ spaceName: "Alpha", tokens: 150, calls: 2 });
    expect(s2).toMatchObject({ spaceName: "s2", tokens: 200, calls: 1 }); // 无名 → 回退 id
    expect(d.bySpace![0].costUsd).toBeGreaterThanOrEqual(d.bySpace![1].costUsd); // 降序
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/usage/dashboard.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `lib/usage/dashboard.ts`**

```ts
import type { Provider } from "@/lib/usage/pricing";
import { aggregateRows, type UsageRow } from "@/lib/usage/aggregate";

export type UsageScope =
  | { kind: "space"; spaceId: string }
  | { kind: "owner" };

export interface UsageTotals {
  totalCostUsd: number;
  totalTokens: number;
  calls: number;
  hasUnpricedRows: boolean;
}

export interface ProviderModelRow {
  provider: Provider;
  model: string;
  costUsd: number;
  tokens: number;
  calls: number;
}

export interface SpaceUsageRow {
  spaceId: string;
  spaceName: string;
  costUsd: number;
  tokens: number;
  calls: number;
}

export interface UsageDashboardData {
  scope: UsageScope;
  totals: UsageTotals;
  byProviderModel: ProviderModelRow[];
  bySpace: SpaceUsageRow[] | null;
}

/** 纯函数:把已取出的 usage 行塑形成仪表盘数据。不触网、可单测。 */
export function buildDashboard(
  rows: UsageRow[],
  ctx: { scope: UsageScope; spaceNames: Record<string, string> },
): UsageDashboardData {
  const totals: UsageTotals = { totalCostUsd: 0, totalTokens: 0, calls: rows.length, hasUnpricedRows: false };
  for (const r of rows) {
    totals.totalTokens += r.total_tokens;
    totals.totalCostUsd += r.cost_usd ?? 0;
    if (r.cost_usd === null) totals.hasUnpricedRows = true;
  }

  const byProviderModel: ProviderModelRow[] = aggregateRows(rows, ["provider", "model"])
    .map((g) => ({
      provider: g.key.provider as Provider,
      model: g.key.model ?? "",
      costUsd: g.totalCostUsd,
      tokens: g.totalTokens,
      calls: g.calls,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  let bySpace: SpaceUsageRow[] | null = null;
  if (ctx.scope.kind === "owner") {
    bySpace = aggregateRows(rows, ["space"])
      .map((g) => {
        const spaceId = g.key.space ?? "";
        return {
          spaceId,
          spaceName: ctx.spaceNames[spaceId] ?? spaceId,
          costUsd: g.totalCostUsd,
          tokens: g.totalTokens,
          calls: g.calls,
        };
      })
      .sort((a, b) => b.costUsd - a.costUsd);
  }

  return { scope: ctx.scope, totals, byProviderModel, bySpace };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/usage/dashboard.test.ts`
Expected: PASS(3 个用例)。

- [ ] **Step 5: Commit**

```bash
git add lib/usage/dashboard.ts tests/usage/dashboard.test.ts
git commit -m "feat(usage): add pure buildDashboard shaping function"
```

---

### Task 3: i18n 文案(`views.usage` + `account.usageLink`)

**Files:**
- Modify: `lib/i18n/copy.ts`
- Test: `tests/unit/i18n.test.ts`(已存在,自动校验)

- [ ] **Step 1: en —— 在 `views:` 对象内加 `usage` 命名空间**

在 `const en = {... views: { ...` 内(例如 `tracked`/`briefs`/`pool` 旁,line ~282 之后)插入:

```ts
    usage: {
      kicker: "USAGE & COSTS",
      title: "AI token usage and spend",
      scopeSpace: "This space",
      scopeOwner: "All your spaces",
      allTime: "All time",
      cardCost: "Total cost (USD)",
      cardTokens: "Total tokens",
      cardCalls: "API calls",
      bySpaceTitle: "By space",
      byModelTitle: "By provider & model",
      colSpace: "Space",
      colProvider: "Provider",
      colModel: "Model",
      colCost: "Cost (USD)",
      colTokens: "Tokens",
      colCalls: "Calls",
      totalRow: "Total",
      emptyTitle: "No usage yet",
      emptySub: "Once AI features run for this space, token usage and cost will show up here.",
      unpricedNote: "Some calls have no registered price and are excluded from cost totals.",
    },
```

- [ ] **Step 2: en —— 在 `account:` 对象内加 `usageLink`**

`account` 对象(line ~38)内加一行(放在 `signOut` 前):

```ts
    usageLink: "Usage & costs",
```

- [ ] **Step 3: zh —— 在 `const zh` 内镜像同样的键**

在 `const zh: typeof en = {... views: {` 内加:

```ts
    usage: {
      kicker: "用量与成本",
      title: "AI token 用量与开支",
      scopeSpace: "本空间",
      scopeOwner: "名下全部空间",
      allTime: "全部时间",
      cardCost: "总成本(USD)",
      cardTokens: "总 token",
      cardCalls: "调用次数",
      bySpaceTitle: "按空间",
      byModelTitle: "按 provider 与 model",
      colSpace: "空间",
      colProvider: "Provider",
      colModel: "Model",
      colCost: "成本(USD)",
      colTokens: "Token",
      colCalls: "次数",
      totalRow: "合计",
      emptyTitle: "暂无用量",
      emptySub: "当本空间产生 AI 调用后,token 用量与成本会显示在这里。",
      unpricedNote: "部分调用无登记价格,未计入成本合计。",
    },
```

zh 的 `account` 对象(line ~586)内加(放在 `signOut` 前):

```ts
    usageLink: "用量与成本",
```

- [ ] **Step 4: 运行 i18n 守卫测试**

Run: `npx vitest run tests/unit/i18n.test.ts`
Expected: PASS —— en/zh 键齐、en 无中文。

- [ ] **Step 5: Commit**

```bash
git add lib/i18n/copy.ts
git commit -m "feat(usage): add usage dashboard i18n copy (en/zh)"
```

---

### Task 4: server 取数层 `loadUsageDashboard`

**Files:**
- Create: `lib/usage/load-dashboard.ts`

> 该层依赖 `cookies()` 与 Supabase server client,不做单元测试(取数为薄层,塑形逻辑已在 Task 2 测过);用 `tsc` + Task 8 的 preview 验证。

- [ ] **Step 1: 实现 `lib/usage/load-dashboard.ts`**

```ts
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
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 3: Commit**

```bash
git add lib/usage/load-dashboard.ts
git commit -m "feat(usage): add RLS-scoped loadUsageDashboard server loader"
```

---

### Task 5: client 展示组件 `UsageDashboardView` + 样式

**Files:**
- Create: `components/workbench/views/usage-dashboard-view.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: 实现组件**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useCopy } from "@/lib/i18n/locale-context";
import { useSpaceSession } from "@/components/account/space-provider";
import type { UsageDashboardData } from "@/lib/usage/dashboard";

const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
const fmtInt = (n: number) => n.toLocaleString("en-US");

export function UsageDashboardView({
  locale,
  data,
  renderedSpaceId,
}: {
  locale: Locale;
  data: UsageDashboardData;
  renderedSpaceId: string;
}) {
  void locale;
  const t = useCopy();
  const tu = t.views.usage;
  const s = useSpaceSession();
  const router = useRouter();

  // page 取的是 cookie 解析出的 renderedSpaceId 的数据。用户用空间切换器(仅写 cookie +
  // 客户端状态)切换后,重跑 server component 以拉取新空间的数据。
  useEffect(() => {
    if (s.currentSpaceId && s.currentSpaceId !== renderedSpaceId) router.refresh();
  }, [s.currentSpaceId, renderedSpaceId, router]);

  const { totals, byProviderModel, bySpace } = data;
  const empty = totals.calls === 0;
  const scopeLabel = data.scope.kind === "owner" ? tu.scopeOwner : tu.scopeSpace;

  return (
    <div className="vv">
      <header className="vv-head">
        <div className="vv-head-left">
          <div className="vv-kicker">{tu.kicker}</div>
          <h2 className="vv-title">{tu.title}</h2>
          <div className="vv-sub">{scopeLabel} · {tu.allTime}</div>
        </div>
      </header>

      <div className="vv-body">
        {empty ? (
          <div className="vv-empty">
            <div className="vv-empty-glyph">📊</div>
            <div className="vv-empty-title">{tu.emptyTitle}</div>
            <div className="vv-empty-sub">{tu.emptySub}</div>
          </div>
        ) : (
          <>
            <div className="usage-cards">
              <div className="usage-card">
                <div className="usage-card-label">{tu.cardCost}</div>
                <div className="usage-card-value">{fmtUsd(totals.totalCostUsd)}</div>
              </div>
              <div className="usage-card">
                <div className="usage-card-label">{tu.cardTokens}</div>
                <div className="usage-card-value">{fmtInt(totals.totalTokens)}</div>
              </div>
              <div className="usage-card">
                <div className="usage-card-label">{tu.cardCalls}</div>
                <div className="usage-card-value">{fmtInt(totals.calls)}</div>
              </div>
            </div>

            {bySpace ? (
              <section className="usage-section">
                <h3 className="usage-section-title">{tu.bySpaceTitle}</h3>
                <div className="vv-table usage-space-table">
                  <div className="vv-row vv-head-row">
                    <span>{tu.colSpace}</span>
                    <span>{tu.colCost}</span>
                    <span>{tu.colTokens}</span>
                    <span>{tu.colCalls}</span>
                  </div>
                  {bySpace.map((r) => (
                    <div className="vv-row" key={r.spaceId}>
                      <span>{r.spaceName}</span>
                      <span>{fmtUsd(r.costUsd)}</span>
                      <span>{fmtInt(r.tokens)}</span>
                      <span>{fmtInt(r.calls)}</span>
                    </div>
                  ))}
                  <div className="vv-row usage-total-row">
                    <span>{tu.totalRow}</span>
                    <span>{fmtUsd(totals.totalCostUsd)}</span>
                    <span>{fmtInt(totals.totalTokens)}</span>
                    <span>{fmtInt(totals.calls)}</span>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="usage-section">
              <h3 className="usage-section-title">{tu.byModelTitle}</h3>
              <div className="vv-table usage-model-table">
                <div className="vv-row vv-head-row">
                  <span>{tu.colProvider}</span>
                  <span>{tu.colModel}</span>
                  <span>{tu.colCost}</span>
                  <span>{tu.colTokens}</span>
                  <span>{tu.colCalls}</span>
                </div>
                {byProviderModel.map((r) => (
                  <div className="vv-row" key={`${r.provider}|${r.model}`}>
                    <span>{r.provider}</span>
                    <span>{r.model}</span>
                    <span>{fmtUsd(r.costUsd)}</span>
                    <span>{fmtInt(r.tokens)}</span>
                    <span>{fmtInt(r.calls)}</span>
                  </div>
                ))}
              </div>
            </section>

            {totals.hasUnpricedRows ? <p className="usage-note">{tu.unpricedNote}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 加样式(`app/globals.css` 末尾追加)**

```css
/* ── Usage dashboard ── */
.usage-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 24px;
}
.usage-card {
  background: #fff;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 16px 18px;
  box-shadow: var(--shadow-card-sm);
}
.usage-card-label {
  font-size: 10.5px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--color-text-sub);
  font-weight: 600;
  margin-bottom: 8px;
}
.usage-card-value {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 700;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
}
.usage-section { margin-bottom: 24px; }
.usage-section-title {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 10px;
}
.usage-space-table .vv-row { grid-template-columns: 2fr 1fr 1fr 1fr; }
.usage-model-table .vv-row { grid-template-columns: 1fr 2fr 1fr 1fr 1fr; }
.usage-space-table .vv-row > span:not(:first-child),
.usage-model-table .vv-row > span:nth-child(n+3) {
  font-variant-numeric: tabular-nums;
}
.usage-total-row {
  background: var(--color-bg-muted);
  font-weight: 700;
}
.usage-note {
  font-size: 12px;
  color: var(--color-text-sub);
  margin-top: 8px;
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 4: Commit**

```bash
git add components/workbench/views/usage-dashboard-view.tsx app/globals.css
git commit -m "feat(usage): add UsageDashboardView component + styles"
```

---

### Task 6: 路由页 `/usage` 与 `/zh/usage`

**Files:**
- Create: `app/usage/page.tsx`
- Create: `app/zh/usage/page.tsx`

- [ ] **Step 1: `app/usage/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { UsageDashboardView } from "@/components/workbench/views/usage-dashboard-view";
import { loadUsageDashboard } from "@/lib/usage/load-dashboard";

export default async function UsagePage() {
  const res = await loadUsageDashboard("en");
  if (res.kind === "redirect") redirect(res.to);
  return (
    <AccountShell locale="en">
      <AppFrame locale="en">
        <UsageDashboardView locale="en" data={res.data} renderedSpaceId={res.renderedSpaceId} />
      </AppFrame>
    </AccountShell>
  );
}
```

- [ ] **Step 2: `app/zh/usage/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { AccountShell } from "@/components/account/account-shell";
import { AppFrame } from "@/components/workbench/app-frame";
import { UsageDashboardView } from "@/components/workbench/views/usage-dashboard-view";
import { loadUsageDashboard } from "@/lib/usage/load-dashboard";

export default async function ChineseUsagePage() {
  const res = await loadUsageDashboard("zh");
  if (res.kind === "redirect") redirect(res.to);
  return (
    <AccountShell locale="zh">
      <AppFrame locale="zh">
        <UsageDashboardView locale="zh" data={res.data} renderedSpaceId={res.renderedSpaceId} />
      </AppFrame>
    </AccountShell>
  );
}
```

- [ ] **Step 3: 类型检查 + 构建冒烟**

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 4: Commit**

```bash
git add app/usage/page.tsx app/zh/usage/page.tsx
git commit -m "feat(usage): add /usage and /zh/usage routes"
```

---

### Task 7: 账户菜单入口(角色门控)

**Files:**
- Modify: `components/account/account-menu.tsx`

- [ ] **Step 1: 加入口按钮**

在 `account-menu.tsx`:
1. 顶部 import 加 `import { getCopy } from "@/lib/i18n/copy";`。
2. 组件内(`const color = ...` 之后)加:

```tsx
  const canViewUsage = s.isOwnerOfCurrent || s.currentRole === "admin";
  const cu = getCopy(locale);
```

3. 在 `user-popover` 内、登出按钮**之前**插入(仅管理员/所有者可见):

```tsx
          {canViewUsage ? (
            <button
              type="button"
              className="user-row"
              onClick={() => router.push(locale === "zh" ? "/zh/usage" : "/usage")}
            >
              <span className="urowtxt">
                <span className="urowname">{cu.account.usageLink}</span>
              </span>
            </button>
          ) : null}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 3: Commit**

```bash
git add components/account/account-menu.tsx
git commit -m "feat(usage): add role-gated usage dashboard entry in account menu"
```

---

### Task 8: 集成验证

**Files:** 无(仅验证)

- [ ] **Step 1: 全量类型检查**

Run: `npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 2: 全量测试**

Run: `npx vitest run`
Expected: 全绿(含 aggregate 3 例、dashboard 3 例、i18n 守卫)。

- [ ] **Step 3: 生产构建冒烟**

Run: `npx next build`
Expected: 构建通过,`/usage` 与 `/zh/usage` 出现在路由清单。

- [ ] **Step 4: preview 手动验证(用 preview_* 工具)**

- 启动 dev server,以**管理员**身份访问 `/usage`:看到汇总卡片 + provider/model 表,**无** by-space。
- 以**所有者**身份访问:额外看到 by-space 表 + 合计行。
- 以**普通成员**身份访问 `/usage`:被重定向回首页;账户菜单**无**入口。
- 切到 `/zh/usage`:中文文案正确、无英文残留。
- 截图留证(preview_screenshot)。

- [ ] **Step 5: 最终评审 + 收尾**

派 final code reviewer 过一遍整体改动,然后用 superpowers:finishing-a-development-branch 收尾(开 PR 前按记忆约定**先口头确认**再 push)。

---

## 注意事项(贯穿全程)
- **不**新增/修改 Supabase 迁移;本功能纯读 `usage_logs`(已上线)。
- **不**用 service-role 读数据;一律 `createSupabaseServerClient()`(RLS)。
- 新增 UI 文案**必须**走 `copy.ts`,禁止组件内硬编码中文(账户菜单新入口用 `getCopy`)。
- by-space/管理员视角数据完整性依赖归账 chip `task_2b4e55db`;chip 未合入前空间维度数据可能偏少,属已知限制,**不**在本计划内处理。
- push/开 PR 前先口头跟用户确认。
