# 候选信号来源链接：可读性修复 + 取链优化

> 2026-06-15 · 涉及"候选信号的唯一新闻源链接"与"生成简报"两个功能在生产环境失效的修复，
> 以及摄取阶段来源 URL 经常落成网站首页的根因与改造。

## 背景 / 症状

生产环境（Vercel，真实摄取空间，如 `Mr.Marco` / 追踪对象「华人螺丝网」）出现两个一起失效的问题：

1. **候选信号卡片上的"↗ 查看原文"来源链接消失**。
2. **点"生成简报"报错** `Cannot generate editorial brief without at least one source`。
3. 链接恢复后，URL 指向 `luosi.com` **首页**而不是具体文章页。

本地用 demo 空间（`林哈哈聊太空`，fixtures 自带 sources）一切正常 —— 这是关键线索：问题只在"真实空间 + 真实摄取数据"出现。

## 根因分析

### 根因 A：`sources` 表 RLS 拦读 → `state.sources` 为空（导致 1 和 2）

两个功能依赖同一份数据 `state.sources`：

- 来源链接：`workbench.tsx` 的 `signalSourceById` 取 `signal.sourceIds[0]` 到 `state.sources` 里找。
- 生成简报：`generateBriefForSignal` 用 `state.sources.filter(s => signal.sourceIds.includes(s.id))`，为空即抛错。

服务端构建状态的链路是正确的：
`account-shell（server）→ getSpaceContent(spaceId) → buildSpaceState({ sources: dbContent.sources }) → 客户端 state.sources`。

`getSpaceContent` 读 sources 用的是**终端用户登录态**（anon key + auth cookie，受 RLS 约束）；
摄取写入用 **service role**（绕过 RLS）。`sources` 是全局表，迁移里**从未启用 RLS、也没有读策略**。

但只要 `sources` 在面板上被启用了 RLS（Supabase 常提示 "Enable RLS"）却没配读策略，**用户态就一行都读不到** → `state.sources` 空 → 链接消失 + 生成简报失败。

数据库侧已用 SQL 确认：问题信号的 `source_ids` **有值**（`["767b6d33-…"]`），即数据没缺失，纯粹是读不到 → 锁定 RLS。

雪上加霜：`getSpaceContent` 读 sources 时 `const { data } = ...` **吞掉了 error**，把"读不到"伪装成"没有来源"，日志里看不到。

### 根因 B：摄取存的是模型自填的 URL → 经常是首页（导致 3）

摄取用 Gemini（`googleSearch` 工具）找新闻，让模型在 JSON 里自填 `url`，`ingest-writer` 直接存这个值。
LLM 不擅长准确产出文章深链，知道来自「华人螺丝网/luosi.com」却编不出 permalink，**退而给站点首页**。
同时 Gemini 真正引用的来源在 `groundingMetadata.groundingChunks[].web.uri`，原代码 `void groundingChunks` **丢弃了**。

## 改动清单

### 1. 迁移 `supabase/migrations/0008_sources_read_policy.sql`（修根因 A）

幂等地给 `sources` 加全局读策略，无论面板是否误开过 RLS，用户态都能读到来源：

```sql
alter table sources enable row level security;          -- 已开则幂等
drop policy if exists sources_read on sources;
create policy sources_read on sources for select using (true);  -- 全局可读
```

写入仍只走 service role（绕过 RLS，未给 authenticated/anon 任何写策略）。
**DB 层立即生效，不需要部署。**

### 2. `lib/account/content-queries.ts`（可观测性）

`getSpaceContent` 读 sources 不再吞错：检查 `error` 并 `console.error`（带 spaceId + referenced 数量），
以后此类"读不到来源"会直接出现在 Vercel 日志，而非静默 0。

### 3. `lib/ingest/gemini-search.ts`（修根因 B）

新增 `chooseSourceUrl(item, groundingChunks)`，取链优先级：

| 优先级 | 来源 | 说明 |
|---|---|---|
| A | grounding 真实 uri（按标题匹配） | Google 实际引用页，准确（重定向链接，点击可达真实文章） |
| B | 模型 url | 仅当是具体文章页；`isLikelyHomepageUrl` 过滤纯域名/首页/`/news`、`/index.html` 等栏目根 |
| 兜底 | 唯一 grounding 来源 | 模型 url 是首页/空且整轮只有一个 grounding 来源时，几乎必是该文章 |
| 最后 | 保留首页 | 实在只有首页就保留（不丢信号）；完全无链接才丢弃 |

辅助导出：`isLikelyHomepageUrl(url)`、`chooseSourceUrl(item, chunks)`（均有单测）。
`buildSearchPrompt` 提示词强化：要求"具体文章页 permalink、禁止首页/栏目页，拿不到就省略别用首页凑数"。

## 生效范围 / 注意

- **根因 A 的修复（迁移 0008）**：DB 层立即生效，链接与生成简报当即恢复。
- **根因 B 的修复（取链逻辑）**：只影响**部署后新摄取**的信号；**旧数据不会自动变**。
  既有的首页 URL 需要重新摄取对应追踪对象，或手动改库里的 `sources.url`。

## 验证

- `tests/ingest/gemini-search.test.ts`：13 项通过（含 `isLikelyHomepageUrl`、`chooseSourceUrl` 优先级、parse 行为）。
- `npx tsc --noEmit`：通过。

## 排查现有"首页/纯域名"来源的 SQL

在 Supabase SQL Editor 跑，列出需要重新摄取或手改的来源：

```sql
-- 全部"纯域名 / 首页 / 栏目根"来源
select id, url, title, publisher, retrieved_at
from sources
where url ~ '^https?://[^/]+/?$'                                                  -- 仅域名或末尾斜杠
   or url ~* '^https?://[^/]+/(index(\.html?|\.php)?|home|default\.html?|news|zh|cn|en|zh-cn)/?$'  -- 单段栏目根
order by retrieved_at desc;

-- 进一步：这些首页来源被哪些信号 / 空间引用（便于决定重新摄取范围）
select s.id as source_id, s.url, cs.headline, sp.name as space, cs.tracking_object_id
from sources s
join candidate_signals cs on s.id = any(cs.source_ids)
join spaces sp on sp.id = cs.space_id
where s.url ~ '^https?://[^/]+/?$'
   or s.url ~* '^https?://[^/]+/(index(\.html?|\.php)?|home|default\.html?|news|zh|cn|en|zh-cn)/?$'
order by sp.name, cs.detected_at desc;
```

> 该正则与代码里的 `isLikelyHomepageUrl` 判定一致（无路径 / 单段通用栏目根）。

## 相关文件

- `supabase/migrations/0008_sources_read_policy.sql`
- `lib/account/content-queries.ts`（`getSpaceContent`）
- `lib/ingest/gemini-search.ts`（`chooseSourceUrl` / `isLikelyHomepageUrl` / `buildSearchPrompt`）
- `lib/db/ingest-writer.ts`（写入 `sources` + 回填 `source_ids`，未改，仅参考）
- `tests/ingest/gemini-search.test.ts`
