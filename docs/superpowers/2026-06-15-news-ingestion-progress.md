# LHH 新闻情报接入 — 设计与推进进度（交接快照 2026-06-15）

> 上下文将满,本文是完整交接。配套:设计 spec `docs/superpowers/specs/2026-06-14-lhh-news-ingestion-design.md`、实现计划 `docs/superpowers/plans/2026-06-15-lhh-news-ingestion.md`。跨会话记忆见 `~/.claude/projects/-Users-fengzhou-Code-LHH/memory/`(lhh-ingestion-architecture / infra-change-safety-filter / lhh-design-handoff)。

## 0. 一句话
把 LHH(林哈哈聊太空·情报工作台)从手写假数据,换成**云端每日自动运行的真实新闻情报管道**:Gemini grounding 搜真新闻 → DeepSeek 中文提炼成简报+打分 → 写 Supabase(按 space 隔离)。**前半段(发现→信号→简报→打分)已在 Vercel 真实跑通;后半段(入池→选题卡→分镜脚本)和工作台 UI 仍是 mock/stub。**

## 1. 最终架构(已定)
- **部署**:Vercel(Next.js 15 + Vercel Cron 每日触发);**库**:Supabase 云项目 `sdqqanogjacvlizfuxuv`。全部 Next.js/TS,不引第二套栈。
- **流水线**:`Vercel Cron → /api/ingest → 每个监控对象: Gemini grounding 搜近一周新闻(结构化返回 title/url/publishedDate/summary)→ 代码侧新鲜度过滤+去重(运行内+跨运行)→ DeepSeek 分析成 CandidateSignal+EditorialBrief+打分 → 写 Supabase(带 space_id)`。
- **模型**:搜索 = **Gemini `gemini-3.5-flash` + googleSearch grounding**(每月 5000 次搜索免费);分析 = **DeepSeek `deepseek-v4-flash`**(OpenAI 兼容 `https://api.deepseek.com`,JSON 模式)。RSS 降为 Phase 2 可选兜底(已验证 19 源在 `space-feeds-verified.opml`);X 本期不做。
- **新鲜度保障**:prompt 传绝对日期(事件发生在窗口内)+ 每条回填 published_date + 代码侧窗口过滤 + 去重。核心是"自己卡日期,不信模型"。
- **多空间隔离**:内容按 `space_id` 隔离(账号层主导加列+RLS,本流水线写入时 stamp)。

## 2. 各阶段真实 vs mock 状态(最关键的表)
| 阶段 | 状态 | 说明 |
|---|---|---|
| 发现对象(tracking_objects) | ✅ 真实 | 已 seed 1 条 SpaceX(归"聊太空"空间) |
| 首次信号收集(搜新闻→sources) | ✅ **真跑通** | Gemini grounding,Vercel 实测 |
| 候选信号(candidate_signals) | ✅ **真跑通** | DeepSeek 产出,已落库 |
| 对象简报+打分(editorial_briefs/scores) | ✅ **真跑通** | 真实中文简报已落库 |
| **工作台"运行日更搜索"按钮** | ❌ **假** | `runMockSearchForTrackingObject`,揭示预写 fixture 信号,UI 进度/错误("19 来源池""NASA RSS 503""模拟失败")全写死 |
| 入池/筛选(screening_decisions) | ❌ mock | 工作台内存,账号层归口,本期仍内存 |
| 选题库/选题卡(topic_cards) | ❌ mock | 引擎逻辑在,跑内存 fixtures,确定性转换非生成 |
| **分镜/脚本(productionDrafts)** | ❌ **stub,未接 DeepSeek** | `createStubProduction` 把简报字段套写死脚手架;mock 态另有 1 份手写精品(`productions["b-cna-01"]`)。**完全无 LLM 调用** |
| 工作台 UI 读数 | ❌ 仍读 `phase1-fixtures` | 真简报已在库但**界面看不到**(Layer 1 未做) |

## 3. 多会话协作状态
- **账号层会话**("LHH - account",sessionId `local_70eefca2-6272-4f35-a99f-412bd8a055c5",分支 `feature/account-layer`):第一阶段(登录/空间/成员/邀请)已完成。**正在做 Phase 2**(UI 按空间读真库 / 按需搜索 / fixtures→DB 迁移 = 含我方原 Layer 1)。
- **分工(已敲定)**:账号层主导 space_id+RLS、Layer 1、内容迁库、topic_cards/location_anchors/screening_decisions 的 space_id;我方专注抓取写库 + stamp space_id + 提供 `ingestTrackingObject` 封装。`sources` 全局共享(不加 space_id)。
- **space_id 契约(账号层 0003 迁移已应用到云库)**:7 张表加了 `space_id uuid not null`(tracking_objects/search_runs/candidate_signals/editorial_briefs/content_value_scores/topic_cards/location_anchors);`sources` 不加;RLS 只配 SELECT,**写入必须用 service-role**。空间:聊太空 `7fba52b5-0d74-4345-85ef-419370cdef47`、Mr.Marco `1a3f7b03-...`。
- **当前等待中**:用户已决定 **Phase 2 由账号层收尾,完成后 ping 我接棒**;我届时做 ① 真实 app 端到端验证 ② 抓取侧并行/分批。期间我不动任何东西。
- **协作铁律**(踩过坑):共享工作目录里**分支会被别的会话切换**(曾导致提交落错分支);→ 永远精确 `git add <file>` 绝不 `git add -A`;跨分支干活用独立 worktree;跨会话用 `send_message`。

## 4. 分支与提交
- `main` = `b3d667b`(干净基线)。
- `feature/news-ingestion`(我的,tip **`ae3f05d`**):完整情报接入。关键提交:`4123ea5`(M4/M5)、`878ff87`(C1 稳定去重键/M3 失败记 run)、`34b4c87`(supabase client 改读 `NEXT_PUBLIC_SUPABASE_URL`)、`0c34db1`(**space_id stamping**)、`ae3f05d`(**`ingestTrackingObject` 便捷封装**)。
- `feature/account-layer`(账号层,从我 ingestion 基线拉出):需 **merge `feature/news-ingestion@ae3f05d`** 才能拿到 space_id-aware writer + wrapper。

## 5. 部署状态(Vercel)
- 项目 `lhh-news-ingestion`(团队 `polluxchous-projects`,Hobby),从 worktree `--prod` 部署。生产别名 `https://lhh-news-ingestion.vercel.app`。env 经 CLI `-e` 注入(运行时可用,已验证)。
- **端到端验证成功**:`POST /api/ingest` → `{"ran":1,"summary":[{"brand":"SpaceX","wrote":true}]}`,落库 1 简报「SpaceX周内连发三箭…」+ 4 条近一周来源 + space_id=聊太空。
- ⚠️ 单品牌 ~57s,逼近 Hobby **60s 函数上限**;`maxDuration=300` 在 Hobby 被压到 60。

## 6. 关键事实与坑(gotchas)
1. **Gemini 本机(国内)连不上**(`UND_ERR_CONNECT_TIMEOUT`),**Vercel 美国节点正常**。DeepSeek/Supabase 本机可达。→ 本地调试 Gemini 这步走不通,只能在 Vercel 验(或挂代理)。
2. **60s/品牌 × 50-100 品牌串行单请求必超时**。上规模前**必须**:并行处理多品牌 / 分批 / 后台队列 /(或 Pro 300s + 并行)。当前 1 品牌没问题。
3. **来源 URL 是 Gemini grounding 重定向包装**(`vertexaisearch.../grounding-api-redirect/…`),非干净出版方 URL。后续可加解析重定向取规范 URL。
4. **🔐 密钥已泄露进对话记录**:测试时 Vercel CLI `-e` 报错回显了 GEMINI/DEEPSEEK/SUPABASE_SERVICE_ROLE key。用户选"测后轮换",**仍待轮换**(service-role 最要紧)。后续传密钥别用会被回显的方式(从文件 source / `vercel env add` / 过滤输出)。
4b. `package.json` 原有 `@next/swc-darwin-arm64` 硬依赖会让 Vercel linux 构建挂(EBADPLATFORM),已在 `feature/news-ingestion` 移除——account-layer 若独立部署也需同样处理。
5. **env 变量名**:我方代码读 `NEXT_PUBLIC_SUPABASE_URL`(兜底 `SUPABASE_URL`)+ `SUPABASE_SERVICE_ROLE_KEY`;写库用 service-role(`getServiceClient()`)。`.env.local` 在 `/Users/fengzhou/Code/LHH/.env.local`(gitignored)。
6. **分镜/脚本未接 LLM**:`createStubProduction` 纯模板,要真实化就把它换成 DeepSeek 调用(输入 brief+topicCard,产脚本+分镜,保留二次编辑;引擎其余可复用)。
7. DeepSeek 旧名 `deepseek-chat`/`reasoner` 2026-07-24 后停用,用 `deepseek-v4-flash`。

## 7. 待办 / 下一步
1. **(等待)账号层收尾 Phase 2 → ping 我** → 我做真实 app 端到端验证。
2. **抓取侧并行/分批**(接 50-100 品牌前必做)。
3. **密钥轮换**(用户暂缓;service-role 优先)。
4. **分镜/脚本接 DeepSeek 真生成**(后半段真实化;归我,在隔离 worktree 错开账号层文件)。
5. 清理测试残留(worktree `lhh-news-ingestion` 含 .env.local 副本 / Vercel preview 项目 / 那篇测试简报——简报建议留作 Layer 1 验证样本)。
6. 来源 URL 规范化(解析 grounding 重定向)。

## 8. 文件地图(feature/news-ingestion)
- `lib/ingest/types.ts`(GeminiNewsItem/AnalyzedBrief/IngestResult,IngestResult 含 spaceId)
- `lib/ingest/freshness.ts`(窗口过滤,纯函数,有测试)
- `lib/ingest/gemini-search.ts`(grounding 搜索 + 解析,可注入,有测试;buildSearchPrompt 含 keywords/排除词)
- `lib/ingest/deepseek-analyze.ts`(DeepSeek 分析,可注入,有测试;parseAnalysis 拒空字段/缺 score)
- `lib/ingest/pipeline.ts`(`runIngestForBrand(brand,deps)`,BrandInput 含 spaceId;含跨运行去重)
- `lib/ingest/run.ts`(**`ingestTrackingObject(db, brandRow, opts?)`** 便捷封装:windowDays=7、不跨运行去重、接真实 search/analyze、透传 spaceId、返回 `{wrote,reason}`)
- `lib/db/supabase.ts`(`getServiceClient()`,读 NEXT_PUBLIC_SUPABASE_URL)
- `lib/db/ingest-writer.ts`(`writeIngestResult(db,result)`,幂等 upsert,`computeDedupeKey`=eventDate+排序canonical URLs 哈希,brief 先 draft 写完 score 再置 ready,stamp space_id 到 4 表非 sources)
- `app/api/ingest/route.ts`(GET+POST,INGEST_SECRET/CRON_SECRET 鉴权,加载品牌+seen urls 分页,循环跑+写,失败记 failed run)
- `vercel.json`(每日 cron `0 0 * * *` → /api/ingest)
- 复用:`lib/search/{query-builder,result-normalizer,dedupe}`、`lib/domain/{types,scoring}`
- 测试:`tests/ingest/*`(freshness/gemini-search/deepseek-analyze/pipeline/dedupe-key),全绿 84 项;`npm run build` 通过。
- 工作台(mock,本期不动,账号层归口):`components/workbench/*`、`lib/workflow/local-workflow.ts`、`lib/production/stub-production.ts`、`lib/data/phase1-fixtures.ts`。

## 9. 凭据 / 环境(.env.local @ /Users/fengzhou/Code/LHH)
`GEMINI_API_KEY` `DEEPSEEK_API_KEY` `NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY` `NEXT_PUBLIC_SITE_URL` `INGEST_SECRET` `VERCEL_TOKEN`。(均待轮换的那几个见 §6.4。)
