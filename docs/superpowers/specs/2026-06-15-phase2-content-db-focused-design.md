# Phase 2（聚焦版）设计：内容迁库 + 新对象真实搜索

- 日期：2026-06-15
- 前置：第一阶段账号层已完成并合并 main；`0003_content_space_scoping.sql` 已给内容表加 `space_id` + RLS（已应用云库）。
- 范围：**聚焦版** —— 让「新建对象执行真实搜索、并保留林哈哈聊太空的演示数据」，以最小重写达成。完整工作流迁库（编辑动作持久化）不在本轮。

## 1. 背景与现状

- 账号层（应用→空间→成员→邀请 + 真鉴权）已上线，空间/成员持久化在 Supabase。
- 内容侧此前是内存 fixtures，按空间克隆。第一阶段遗留的接缝：工作台读的是内存 mock，自建对象搜索永远 0 新信号（mock 只会surface预置信号）。
- **情报接入（另一分支）已端到端跑通**（Vercel）：真实 Gemini grounding → DeepSeek → 写库，已在「林哈哈聊太空」空间产出 1 篇真实简报 + 信号 + 4 条来源，`space_id` 正确。
- DB 现状：`tracking_objects`/`search_runs`/`candidate_signals`/`editorial_briefs`/`content_value_scores` 带 `space_id`（RLS：成员/所有者可 SELECT；写入走 service-role）；`sources` 全局。
- 空间：`林哈哈聊太空`（演示）+ `Mr.Marco`（用户新建，空）。

## 2. 目标

1. 工作台**新建的追踪对象持久化到 DB**（带 `space_id`），任何空间都可加。
2. 点「运行搜索」对该对象触发**真实情报管线**（复用情报接入的 `runIngestForBrand` + `writeIngestResult`），写入真实信号/简报到 DB。
3. 工作台**按当前空间从 DB 读真实内容**，取代内存 mock。
4. **保留林哈哈聊太空 10 条 Claude 演示数据**（对象 + 信号 + 简报 + 评分 + 来源迁入 DB）。

## 3. 数据真相边界（按"谁写什么"切）

| 层 | 来源 | 表 |
|----|------|----|
| **DB 真相（按 `space_id`）** | 情报接入产出 + 迁移 | `tracking_objects`、`search_runs`、`candidate_signals`、`editorial_briefs`、`content_value_scores`、`sources`(全局) |
| **内存态（本轮不迁，刷新即重置）** | 工作台编辑动作 / fixtures seed | `screening_decisions`、`topic_cards`、`productions`、`location_anchors` |

该边界与情报接入"我不写 topic_cards / decisions / location_anchors"完全对齐。

## 4. 关键技巧：uuid v5 确定性 id 对齐

迁移时，fixture 的字符串 id（`stoke`、`s-stk-03`、`b-stk-01`…）用 `uuidv5(fixtureId, FIXED_NAMESPACE)` 派生为稳定 uuid 写入 DB。内存编辑层（decisions/topic_cards 等）引用这些 id 时**用同一函数派生同一 uuid**，两边天然对齐，无需运行时映射表。
- 命名空间常量固定写死在 `lib/workflow/fixture-ids.ts`。
- 工具函数 `fid(originalId): string` 统一供迁移脚本与内存 seed 使用。

## 5. 组件设计

### 5.1 一次性迁移 `scripts/migrate-fixtures-to-db.ts`（service-role）
- 把林哈哈聊太空 10 个对象 + 其 `search_runs / candidate_signals / sources / editorial_briefs / content_value_scores` 写入 DB；`space_id` = 林哈哈聊太空；主键用 `fid(原id)`。
- **幂等**（uuid5 主键 upsert，重跑不重复）。
- **不动情报接入已写入的真实数据**（真实 SpaceX 简报与 fixture 共存）。`sources` 按 URL `canonicalizeUrl` 去重 upsert（全局）。
- **不迁** decisions / topic_cards / productions / location_anchors（留内存 seed）。

### 5.2 读路径
- `lib/account/content-queries.ts`：`getSpaceContent(spaceId)` → 按 `space_id` 读 objects/runs/signals/briefs/scores + 关联 sources（行映射 snake→camel，复用 0001 字段）。
- `AccountShell`（服务端）按当前空间调 `getSpaceContent`，连同 members 传给 `SpaceProvider`。
- `seedSpaceContent` → 重构为 `buildSpaceState({ dbContent, members, currentUserId, demoSpace })`：
  - 以 `dbContent` 为底构建 `LocalWorkflowState` 的 DB 层（objects/signals/briefs/scores/sources/runs）。
  - 叠加内存编辑层：若为林哈哈聊太空，用 fixtures seed decisions/topic_cards/productions/location_anchors（引用 id 经 `fid()` 对齐 DB）；否则为空。
  - `teamMembers` / `currentMemberId` 来自真实成员（沿用现逻辑）。
- 切空间 / 写操作后 `router.refresh()` 重新服务端拉取。

### 5.3 新建对象落库
- `addTrackingObject` server action（`lib/account/content-mutations.ts`）：空间成员校验（`getMySpaces` 命中）→ service-role `INSERT tracking_objects`（含 `space_id` + 0001 既有字段，id 用 `gen_random_uuid()`）→ 返回。
- 工作台 `addTracked` 改为调该 action + `router.refresh()`。

### 5.4 按需真实搜索
- `runSearchForObject(trackingObjectId)` server action：读该对象（含 `space_id`）→ 调 `runIngestForBrand(brand, { now })` + `writeIngestResult(result, { spaceId })`（复用情报接入纯函数，接口 (A)，待对方最终确认签名）→ 写 signals/sources/briefs/scores → 返回计数。
- 工作台「运行搜索」按钮改为调该 action（同步 + spinner）→ 完成后 `router.refresh()`。
- **本机限制**：Gemini 本机不可达 → 本机用注入式 stub（`searchRecentNews` 替身返回固定 1-2 条）验通"对象→搜索→写库→读出显示"链路；真实 Gemini 结果在 Vercel 验。
- **风险**：单对象 ~57s 逼近 Vercel Hobby 60s 函数上限。MVP 同步可接受；超时则后续转异步（job + 轮询）或上 Pro。设计中标注，不在本轮解决。

## 6. 来源链接展示
来源 URL 当前为 Gemini grounding 重定向包装（`vertexaisearch.../grounding-api-redirect/…`）。来源面板**按原样显示**，待情报接入加规范化解析后自动变干净。本轮不处理。

## 7. 错误与边界
- 搜索失败（Gemini 超时/网络）：action 捕获 → 工作台 runLog 记 error + feedback，不崩。
- 新对象落库失败（权限/约束）：抛错 → UI 提示。
- 编辑动作（screening/topic_cards/production）**本轮仍内存态、刷新重置** —— 与 §3 边界一致，UI 文档需注明（沿用第一阶段"内容不持久化"提示的精神，针对这些动作）。

## 8. 测试
- `fid()` uuid5 确定性（同输入同输出、URL-safe uuid 格式）。
- `buildSpaceState`：DB 内容为底 + 内存编辑层 id 对齐（topic_card.sourceEditorialBriefId 命中 DB brief 的 `fid`）。
- 迁移脚本幂等（重跑不增行）—— 对云库实跑验证。
- 新对象落库 server action 的成员校验（非成员/非所属空间被拒）。
- 按需搜索 action：注入 stub search，断言写库 + 计数；权限校验。

## 9. 不在本轮范围
- 编辑动作（screening/topic_cards/production）持久化到 DB（= 完整工作流迁库，后续）。
- 抓取并行/分批（情报接入侧，规模化时做）。
- 来源 URL 规范化（情报接入侧后续）。
- 多空间批量 cron 调度策略。

## 10. 风险汇总
- Vercel Hobby 60s vs 单对象 ~57s：同步搜索贴边，标注。
- 内存编辑层与 DB 读层 id 对齐依赖 `fid()` 一致使用——集中到一个工具函数降低出错面。
- 真实搜索本机不可验（Gemini）——本机 stub + Vercel 实测双轨。
