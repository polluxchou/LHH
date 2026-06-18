# 产品需求文档 · Token 用量仪表盘

- 产品：LHH（林哈哈聊太空 · 航天情报筛选/内容生产平台）
- 模块：AI 用量与成本 — 仪表盘（Usage Dashboard）
- 状态：📝 需求确认（待实现）
- 日期：2026-06-17
- 负责：产品 + 工程
- 关联文档：[设计 spec](../superpowers/specs/2026-06-17-usage-dashboard-design.md) · [Token 成本追踪 PRD](2026-06-17-token-cost-tracking-prd.md)

---

## 一、背景与问题

Token 成本追踪的**数据层**已上线（PR #1，`usage_logs` 表 + `lib/usage/*` 全部就绪），每次 AI 调用都会静默落库 token 用量与成本快照。但**产品内没有任何界面**能看这些数据 —— 目前只能让工程在 Supabase SQL Editor 手动跑 SQL。

这导致：
- 空间管理员无法自助查看本空间花了多少 token、多少钱。
- 应用所有者无法横向比较名下各空间的消耗、看汇总。
- 成本数据「写了但没人看」，价值未释放。

本需求补齐**可视化仪表盘**，把已有数据搬到产品内，按权限分层呈现。

## 二、目标 / 非目标

**目标**
- 新增 `/usage` 仪表盘页面（含中文 `/zh/usage`），从账户菜单进入，**仅管理员/应用所有者可见**。
- 展示三类信息：
  1. **汇总卡片** —— 总成本（USD）、总 token、调用次数。
  2. **按 provider + model 拆分** —— claude / gemini / codex / deepseek 各模型的成本与用量。
  3. **按空间拆分（仅所有者视角）** —— 名下各空间的消耗 + 合计行。
- 文案全部双语（en/zh），过 i18n 守卫测试。
- 读取严格受 RLS 约束（成员只读本空间、所有者读名下全部），不绕过权限。

**非目标（本期不做）**
- 时间范围筛选 / 成本趋势图。
- 按 operation（搜索/分析/文章/生产）拆分。
- CSV 导出、预算告警/配额、多币种。
- 「全平台超管」视角（产品上无此角色）。

## 三、用户与权限

平台只有两层权限（沿用 `0002` 账户层 RLS），仪表盘据此分层：

| 角色 | 判定 | 能看到 |
|---|---|---|
| 普通成员 | `space_members.role = 'member'` | ❌ 无权访问，账户菜单不显示入口，直接访问 `/usage` 重定向回首页 |
| 空间管理员 | `space_members.role = 'admin'`（非所有者） | 仅**当前空间**：汇总卡片 + provider/model 拆分 |
| 应用所有者 | `is_space_owner`（应用 owner） | 名下**所有空间**：汇总卡片（跨空间求和）+ by-space 拆分表（含合计）+ provider/model 拆分 |

> 「合计」是所有者自己应用内的汇总，**不是**全平台总数 —— 与「不暴露跨应用聚合」的边界一致。

## 四、关键产品决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 入口位置 | 独立 `/usage` 路由，账户菜单进入 | 不污染主导航；按角色显示 |
| 可见范围 | 管理员看本空间，所有者额外看 by-space | 与 RLS 两层权限对齐 |
| 「看总数」实现 | 所有者 by-space 表含合计行 | 满足需求，又不暴露全平台聚合 |
| 统计口径 | 全部时间（v1 不做时间筛选） | YAGNI，先把核心搬出来 |
| 数据读取 | RLS 客户端，不用 service-role | 读路径必须受权限约束 |
| 图表 | 本期纯表格 + 卡片（无图表库） | 复用现有手写 UI 令牌，快速交付 |

## 五、功能需求

### 5.1 页面入口
- 账户菜单新增「用量与成本 / Usage & Costs」入口，**仅** admin/owner 角色可见。
- 路由 `/usage` 与 `/zh/usage`，与现有页面同样走 `AccountShell → AppFrame → View` 包壳。

### 5.2 访问控制
- 未登录 → 重定向登录页。
- 已登录但当前空间角色为普通成员 → 重定向首页。
- 读取一律 RLS 客户端，权限在数据库与页面双重把关。

### 5.3 汇总卡片
- 总成本（USD，`$` 前缀，保留 4 位小数）。
- 总 token。
- 调用次数。
- 口径：当前可见范围内的全部时间。

### 5.4 按 provider + model 拆分表
- 列：provider、model、成本、token、调用次数。
- 按成本降序。

### 5.5 按空间拆分表（仅所有者）
- 列：空间名、成本、token、调用次数。
- 末尾合计行。
- 空间名缺失时回退显示空间 id。

### 5.6 空态与提示
- 无数据 → 友好空态，说明「交互动作需完成空间归账后才会显示」。
- 存在无价格行（未登记 model / claude·codex 预留）→ 页脚标注「部分调用无价格、未计入成本」。

## 六、数据与技术方案

数据底座（已上线）：`usage_logs` 表 + `lib/usage/*`。本期新增**展示层**，核心计算用纯函数保证可测：

```
app/usage/page.tsx (server)
  解析 user + 当前空间 + role/isOwner
  → 角色门（非 admin/owner 重定向）
  → RLS 客户端查 usage_logs（管理员按当前 space 过滤；所有者不过滤，RLS 自动给名下全部）
  → 查 spaces 取 id→name
  → buildDashboard(rows, {scope, spaceNames})   ← 纯函数，单测覆盖
  → <UsageDashboardView/>（client，纯展示 + useCopy）
```

涉及文件：
- 新增：`app/usage/page.tsx`、`app/zh/usage/page.tsx`、`lib/usage/dashboard.ts`、`lib/usage/load-dashboard.ts`、`components/workbench/views/usage-dashboard-view.tsx`、`tests/usage/dashboard.test.ts`、相关 css。
- 修改：`lib/usage/aggregate.ts`（`UsageRow` 加 `space_id`、`GroupDim` 加 `"space"`）及其测试、`lib/i18n/copy.ts`（新增 `usage` 命名空间 en/zh + `account.usageLink`）、账户菜单组件。

技术细节见[设计 spec](../superpowers/specs/2026-06-17-usage-dashboard-design.md)。

## 七、验收标准

- `/usage` 与 `/zh/usage` 可访问，包壳一致。
- 普通成员访问被重定向，账户菜单无入口。
- 空间管理员仅见本空间数据；应用所有者见名下全部 + by-space + 合计。
- 汇总卡片、provider/model 表数值与库内一致（口径全部时间）。
- 无数据时正确显示空态；含无价格行时显示页脚提示。
- `npx tsc --noEmit` 0 错误；`npx vitest run` 全绿（含 i18n 守卫、aggregate space 维度、dashboard 纯函数用例）。
- 中文文案不硬编码，全部走 `copy.ts`。

## 八、依赖 / 风险 / 限制

1. **交互动作的 by-space 数据依赖归账 chip**（`task_2b4e55db`）：ingest 链路已按 `space_id` 归账；brief/article/production 的 action 层已支持 `spaceId`，但需**调用方 UI 透传当前 spaceId**才落空间。未归账行（`space_id=null`）按 RLS 不可读，不会出现在任何空间视图（不报错，仅不显示）。在该 chip 合入前，by-space/管理员视角可能数据偏少。
2. 单一币种 USD。
3. 无图表库 → 本期纯表格；趋势图属后续。
4. 时间筛选、按 operation 拆分、CSV 导出 = 后续迭代。

## 九、后续迭代（Backlog）

- 时间范围筛选 + 成本趋势图。
- 按 operation 拆分、按用户拆分。
- CSV / 报表导出。
- 预算告警与配额。
- claude / codex 真实接入后的价格复核与展示。
