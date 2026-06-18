# Token 用量仪表盘 · 设计 spec

- 产品：LHH（林哈哈聊太空 · 航天情报筛选/内容生产平台）
- 模块：AI 用量与成本 — 仪表盘（Usage Dashboard）
- 日期：2026-06-17
- 状态：设计稿（待实现）
- 关联：[Token 成本追踪设计](2026-06-16-token-cost-tracking-design.md) · [Token 成本追踪实现计划](../plans/2026-06-16-token-cost-tracking.md) · [Token 成本追踪 PRD](../../product/2026-06-17-token-cost-tracking-prd.md)

---

## 一、背景

Token 成本追踪的**数据层**已上线（PR #1，`usage_logs` 表 + `lib/usage/*` 全部就绪），但**没有任何前台界面**读这些数据 —— 当前只能在 Supabase SQL Editor 手动查表。本期补齐「可视化仪表盘」，让空间管理员/应用所有者在产品内直接看到 AI 用量与成本。

数据层已具备：
- `usage_logs` 表：每次 AI 调用一行，含 `space_id`、`provider`、`model`、`operation`、token 数、单价快照、`cost_usd`。
- RLS（`0011_usage_logs.sql`）：`space_id is not null and (is_space_member(space_id) or is_space_owner(space_id))` —— **成员只读本空间、应用所有者读名下全部空间**。
- 聚合辅助 `lib/usage/aggregate.ts` 的 `aggregateRows(rows, groupBy)`。

## 二、目标 / 非目标

**目标**
- 新增 `/usage` 页面（含 `/zh/usage`），从账户菜单进入，仅管理员/所有者可见。
- 汇总卡片：总成本（USD）、总 token、调用次数。
- 按 `provider + model` 拆分表。
- 应用所有者额外可见「按空间拆分表（含合计行）」。
- 全部文案走 `lib/i18n/copy.ts`（en/zh），过 i18n 守卫测试。
- 数据读取走 RLS 客户端（`createSupabaseServerClient`），不绕过 RLS。

**非目标（本期不做）**
- 时间范围筛选 / 成本趋势图（Q3 未选时间维度）。
- 按 `operation` 拆分。
- CSV 导出 / 预算告警 / 多币种。
- 给普通成员或「全平台超管」开放（产品上无超管概念）。

## 三、关键产品决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 入口位置 | 独立 `/usage` 路由，从账户菜单进入 | 不污染主导航；管理员/所有者才显示 |
| 可见范围 | 管理员看本空间；所有者额外看名下各空间拆分 | 与 RLS 两层权限天然对齐 |
| 跨空间「总数」 | 仅所有者视角的 by-space 表含合计行（其应用内汇总） | 满足「看总数」，又不暴露全平台聚合 |
| 统计口径 | 全部时间 | YAGNI；时间筛选留后续 |
| 拆分维度 | 汇总卡片 + by provider+model（+ 所有者 by-space） | 用户多选结果 |
| 数据读取 | RLS 客户端（anon/auth），**不**用 service-role | 读路径必须受 RLS 约束 |

### 权限语义（调和 Q1 与 Q3）
- **普通成员**：无权访问，重定向回首页，账户菜单不显示入口。
- **空间管理员（role=admin，非所有者）**：仅看**当前空间**（汇总卡片 + provider/model 拆分）。无 by-space、无跨空间数据。
- **应用所有者（is_space_owner）**：看名下**所有空间**（汇总卡片跨空间求和 + by-space 拆分表含合计行 + provider/model 拆分）。此「合计」是所有者自己应用内的汇总，非全平台总数。

## 四、架构与数据流

```
app/usage/page.tsx (server component)
  1. getSessionUser() —— 未登录 → 重定向 /login
  2. 复用 account/queries + resolve-space：解析当前空间 id、当前 role、isOwner
  3. 角色门：非 admin 且非 owner → redirect 首页
  4. RLS 客户端查 usage_logs：
       - 管理员（非所有者）：.eq("space_id", currentSpaceId)
       - 所有者：不加 space 过滤（RLS 自动返回名下全部空间的行）
  5. 查 spaces 取 id→name 映射（RLS 客户端，同样受 RLS 约束）
  6. buildDashboard(rows, { scope, spaceNames })  ← 纯函数，单元测试覆盖
  7. 渲染 <UsageDashboardView data={...} locale={...} />（client，纯展示 + useCopy）
```

- `buildDashboard` 是**纯函数**：输入 `UsageRow[]` + 上下文，输出可序列化的 `UsageDashboardData`，便于单测，不触网。
- 取数（Supabase 查询）放在 page 里，薄薄一层；不进纯函数。

### 组件边界
- `lib/usage/dashboard.ts` — `buildDashboard()` + 类型 `UsageDashboardData`、`UsageScope`。纯函数。
- `lib/usage/aggregate.ts` — 扩展：`UsageRow` 加 `space_id`，`GroupDim` 加 `"space"`。
- `app/usage/page.tsx` / `app/zh/usage/page.tsx` — server，取数 + 角色门 + 包壳（AccountShell → AppFrame → View）。
- `components/workbench/views/usage-dashboard-view.tsx` — client，纯展示。
- 账户菜单组件 — 加 `/usage` 入口（按 admin/owner 条件显示）。
- `lib/i18n/copy.ts` — 新增 `usage` 命名空间（en/zh）。

## 五、数据结构

```ts
// lib/usage/aggregate.ts —— 扩展现有
export interface UsageRow {
  space_id: string | null;   // 新增
  provider: Provider;
  model: string;
  operation: UsageOperation;
  total_tokens: number;
  cost_usd: number | null;
  created_at: string;
}
export type GroupDim = "provider" | "model" | "operation" | "day" | "space"; // +space

// lib/usage/dashboard.ts —— 新增
export type UsageScope =
  | { kind: "space"; spaceId: string }   // 管理员：单空间
  | { kind: "owner" };                    // 所有者：名下全部

export interface UsageTotals {
  totalCostUsd: number;
  totalTokens: number;
  calls: number;
  hasUnpricedRows: boolean; // 存在 cost_usd=null 的行
}
export interface ProviderModelRow {
  provider: Provider; model: string;
  costUsd: number; tokens: number; calls: number;
}
export interface SpaceRow {
  spaceId: string; spaceName: string;
  costUsd: number; tokens: number; calls: number;
}
export interface UsageDashboardData {
  scope: UsageScope;
  totals: UsageTotals;
  byProviderModel: ProviderModelRow[]; // 成本降序
  bySpace: SpaceRow[] | null;          // 仅 owner，合计由 UI 渲染
}

export function buildDashboard(
  rows: UsageRow[],
  ctx: { scope: UsageScope; spaceNames: Record<string, string> },
): UsageDashboardData;
```

- `byProviderModel`：用 `aggregateRows(rows, ["provider","model"])` 映射。
- `bySpace`：scope=owner 时用 `aggregateRows(rows, ["space"])` 映射 + 用 `spaceNames` 补名；否则 `null`。
- `cost_usd=null` 计为 0，但置 `hasUnpricedRows=true`。

## 六、UI

套用现有 view 结构（`vv`/`vv-head`/`vv-kicker`/`vv-title`）与 `globals.css` 设计令牌。

- `vv-head`：kicker = `usage.kicker`；title = `usage.title`；副标题说明范围（本空间 / 全部空间）与口径（全部时间）。
- 汇总卡片行：总成本（`$` 前缀，保留 4 位）、总 token、调用次数。
- 所有者：by-space 表（空间名 / 成本 / token / 次数 + 末尾合计行）。
- by provider+model 表（provider / model / 成本 / token / 次数）。
- 空态：`usage.empty`，提示交互动作需归账后才显示。
- 页脚：`hasUnpricedRows` 为真时显示 `usage.unpricedNote`。

## 七、错误与边界

- 未登录 → 重定向 `/login`（沿用现有 AccountShell 行为）。
- 无空间 → 沿用现有 `/no-space` 行为。
- 普通成员访问 `/usage` → 重定向首页。
- 查询失败 → 渲染空态 + 错误提示文案（不泄露堆栈）。
- `usage_logs` 为空（新表、尚无调用）→ 空态。
- `space_id=null` 的行（未归账）RLS 不可读，自然不出现，不报错。

## 八、测试

- `tests/usage/dashboard.test.ts`：
  - 空行 → totals 全 0、空态、`hasUnpricedRows=false`。
  - 管理员 scope：byProviderModel 正确求和、降序；bySpace=null。
  - 所有者 scope：bySpace 按空间求和、用 spaceNames 补名、未知空间名回退 id。
  - `cost_usd=null` 计 0 且 `hasUnpricedRows=true`。
  - 多 provider/model 聚合正确。
- `tests/usage/aggregate.test.ts`：补 `"space"` 维度分组用例。
- `tests/unit/i18n.test.ts`：自动校验 `usage` 命名空间 en/zh 键齐、en 无中文。

## 九、依赖 / 限制

1. **交互动作的 by-space 数据依赖归账 chip**（`task_2b4e55db`）：ingest 已按 `space_id` 归账；brief/article/production 的 action 层已支持 `spaceId`，但需**调用方 UI 透传当前 spaceId**才落空间。未归账行（`space_id=null`）RLS 不可读，不显示。
2. 单一币种 USD。
3. 时间筛选/趋势、按 operation 拆分、CSV 导出 = 后续。
