# LHH 真实新闻情报源接入 — 设计文档

- 日期：2026-06-14
- 状态：设计已确认，待实现
- 相关记忆：`lhh-ingestion-architecture`、`lhh-design-handoff`

## 1. 背景与目标

LHH（林哈哈聊太空 · 情报工作台）当前运行在 `lib/data/phase1-fixtures.ts` 的**手写假数据**上：`candidateSignals`、`editorialBriefs`、`contentValueScores` 等全是字面量，其中 06-13 批次是人用 Claude web search 手动誊进去的。`dedupeKey`/`confidence`/`searchRunId` 等字段是糊弄的，没有真实出处，且不会自更新。

**目标**：用一条**云端每日自动运行**的真实新闻情报管道替换假数据——自动搜网、提炼成结构化简报（带真实出处 URL）、打分、写入 Supabase；工作台改为读 Supabase。

**非目标（本期不做）**：X 推文接入（需 X 官方 API 付费或 Apify 爬取，合规/稳定性风险，延后）；RSS（列为 Phase 2 可选兜底，见 §7）；编辑部后半段工作流（四态筛选、分镜脚本）已有，不在本期重写。

## 2. 总体架构

```
Vercel 每日 Cron
  └→ POST /api/ingest  (Next.js Route Handler，密钥保护)
        ├─ 从 Supabase 读 tracking_objects（监控品牌，50-100）
        ├─ 对每个品牌：
        │    ① Gemini grounding 搜索 → 返回结构化近期新闻条目（标题/URL/发布日期/摘要）
        │    ② 代码侧新鲜度过滤 + 去重（lib/search/dedupe）
        │    ③ DeepSeek 分析 → CandidateSignal + EditorialBrief 各字段
        │    ④ 复用 lib/domain/scoring → ContentValueScore
        └─ 写回 Supabase（sources / candidate_signals / editorial_briefs / content_value_scores / search_runs）
  ⟵ 工作台页面改为读 Supabase（替代 phase1-fixtures）
```

技术栈判断：**全部留在 Next.js/TS**。抓取逻辑写成 Next.js API route，直接复用现有纯函数，不引入 Python/第二套栈。Supabase 仅作数据库；调度用 Vercel Cron（非 pg_cron）。

## 3. 模型分工

- **Gemini grounding（搜索）**：调 Gemini API 开启 Google Search grounding，按品牌搜近期新闻。优势：自带联网、返回引用 URL（解决溯源）、**每月 5000 次搜索免费**（本量级基本免费）。要求结构化输出：每条含 `title / url / published_date(ISO) / summary`。
- **DeepSeek（分析）**：走 OpenAI 兼容接口 `https://api.deepseek.com`（模型 `deepseek-v4-flash`，注意旧名 `deepseek-chat` 2026/07/24 后改名）。把搜到的条目提炼成 `CandidateSignal`（信号类型/headline/summary/eventDate/confidence）与 `EditorialBrief`（factSummary/whyItMatters/possibleAngles/openQuestions/riskNotes 等）。中文为主、成本极低。

为什么这样分：DeepSeek API 无内置 web search，故搜索交给有 grounding 的 Gemini；DeepSeek 干便宜的重活（分析/写作）。

## 4. 新鲜度保障（关键，因放弃了 RSS 的 pubDate 确定性）

原则：每个关键词搜的是**所报道事件本身发生在过去一周**的新闻（不只是"最近发布"，排除周年回顾/背景/综述）；且**以往运行已处理过的内容，在分析前就过滤掉**（省 DeepSeek 调用、避免重复简报）。

Gemini grounding 无硬日期参数，故用"引导 + 验证"两手：
1. **prompt 传绝对日期 + 强调事件发生在窗口内**：`今天 YYYY-MM-DD，找事件发生在 [起] 至 [今] 的新闻，排除事件在窗口外的旧闻/回顾/综述`（算好日期，不用相对词）。
2. **查询带时效词**（past week / since [date]）。
3. **每条回填 `published_date` → 代码侧过滤**：丢弃窗口外的条目（把尽力而为变确定性）。**核心保障之一。**
4. **跨运行去重（分析前）**：运行开始时从 Supabase `sources` 加载已入库 url（canonical），用 `lib/search/dedupe` 的 `canonicalizeUrl` 比对，**在调用 DeepSeek 之前**剔除已处理过的条目；写库再靠 `sources.url`、`(tracking_object_id, dedupe_key)` 唯一约束兜底防重复行。**核心保障之二。**
5. **增量框定**：每日按"自上次运行日期以来"滚动窗口。
6.（可选增强）顺 URL `web fetch` 核验真实发布时间；用 DeepSeek 返回的 `eventDate` 再校验事件确在窗口内。

已知局限：grounding 非确定性 feed，可能**漏**某些很新的条目（这是放弃 RSS 失去的"不漏"特性）。可接受；如需"不漏"，启用 §7 的 RSS 兜底。

## 5. 现有代码复用

- `lib/search/query-builder.ts`：从 tracking object 生成搜索查询，喂给 Gemini 的搜索 prompt。
- `lib/search/result-normalizer.ts`：Gemini 返回条目 → `Source`（`MockSearchResult` 形状对得上，需小幅适配字段名）。
- `lib/search/dedupe.ts`：URL 规范化 + 去重，直接用。
- `lib/domain/scoring.ts`：`getOverallRecommendation` 等，生成 `ContentValueScore`。
- `lib/briefing/brief-generator.ts`：现为模板生成；本期 brief 主体由 DeepSeek 产出，此文件保留为结构兜底/fallback（DeepSeek 失败时出基础版简报）。
- `lib/domain/types.ts`：所有产出严格对齐既有类型与 Supabase 9 张表。

## 6. 落地顺序（三层）

1. **第 1 层 · 持久化**：接 `@supabase/supabase-js`（env：URL + service key）；把工作台读取路径从 `phase1-fixtures` 切到 Supabase 查询；seed 脚本把现有 fixtures 写入 Supabase 作为初始数据，确保 UI 不空。
2. **第 2 层 · 接入**：`app/api/ingest/route.ts`（POST，`INGEST_SECRET` 保护）。实现 Gemini 客户端、DeepSeek 客户端、§2 流程、§4 新鲜度逻辑，写库。
3. **第 3 层 · 调度**：`vercel.json` 配 Cron 每日 POST `/api/ingest`。

每层独立可验证：第1层做完工作台读真库；第2层手动触发 ingest 能产生真实简报；第3层定时自动化。

## 7. Phase 2 可选增强（本期不做，留记录）

- **薄 RSS 兜底**：用已验证的 19 个媒体源（`space-feeds-verified.opml`）做"零成本、确定性新鲜、不漏"的基础盘，与 Gemini 搜索结果去重合并。补 Gemini 可能漏掉的高频媒体动态。
- **X 接入**：官方 API（合规稳定付费）或 Apify 爬取（便宜但灰色脆弱）二选一。
- **源清单维护**：偶尔（月/季）用 Claude Code 搜+验证刷新源，非日常。

## 8. 运营成本预估（50-100 品牌 / 每日一次 / 不含 X）

驱动 = 每天走完流水线的相关新闻条数（估 30-100）。当前实价（2026-06）：
- Gemini grounding：5000 次/月免费 → 本量级**搜索基本 $0**；token 用 Flash，少量。
- DeepSeek v4-flash：输入 $0.14/M、输出 $0.28/M → 每条 ~$0.002，月 ~$6。
- Supabase：早期免费档（每日活动可避免休眠）；上线正式服务上 Pro **$25/月**（买备份+稳定，非防休眠）。
- Vercel：免费档大概率够。

**合计**：早期 ~$10/月内；正式上线含 Supabase Pro 约 **$30-40/月**。价格会变，定预算前复核。

## 9. 需用户提供的前置

- Gemini API key、DeepSeek API key（写入 Vercel/本地 env）。
- 确认/创建 Supabase 项目并应用 `supabase/migrations/0001_initial_schema.sql`，提供项目 URL 与 key。
- 监控品牌清单（写入 `tracking_objects`；当前 fixtures 里有 ~10 个，扩到 50-100 由用户提供或后续整理）。
