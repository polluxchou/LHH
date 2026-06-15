# LHH 新闻情报接入 — 未完成清单(2026-06-15)

> 配套进度快照 `2026-06-15-news-ingestion-progress.md`。本文只列**还没做的**。
> 状态:🔄 进行中 · ⬜ 待开始 · ⭕ 可选/后续。归属:【我】抓取侧(feature/news-ingestion)·【账】账号层(feature/account-layer Phase 2)·【用】用户·【共】需协调。

## 概览:约 15 项
- 真正阻塞"端到端在界面可见":B 组(账号层 Phase 2)3 项 + A1。
- 阻塞"上规模(50-100 品牌)":A1。
- 阻塞"安全":C1。
- 其余为质量提升/后续增强。

---

## A. 抓取侧(我方)
| # | 项 | 状态 | 优先级 | 说明 |
|---|---|---|---|---|
| A1 | **并行/分批跑多品牌** | ⬜ | 🔴 高(上规模必做) | 现单请求串行,单品牌 ~57s,Hobby 60s 上限 → 50-100 品牌必超时。需并行/分批/后台队列/或 Pro 300s。1 品牌现在没问题 |
| A2 | **分镜/脚本接 DeepSeek 真生成** | ✅ 完成(2026-06-15) | — | 已实现:`lib/production/deepseek-script.ts`(buildScriptPrompt+b-cna-01 few-shot / parseProduction 守卫 / generateProduction 注入+组装+**失败重试1次**)、server action `app/actions/generate-production.ts`、reducer `setProductionDraft`、工作室「✨AI生成」按钮+loading、provider `generateProduction`。106 单测绿、tsc/build 通过。**真实 DeepSeek 实测:7/7 近期调用产出高质量中文脚本+分镜(12-15min→12-14镜)**;偶发不达标已用重试兜底,失败保留 stub+runLog。spec/plan:`docs/superpowers/{specs/2026-06-15-lhh-production-deepseek-design,plans/2026-06-15-lhh-production-deepseek}.md`。**唯一 collision `workflow-provider.tsx` 的二次合并待账号层 B2 落定后由我解**(generateProduction 为新方法,与其 runSearchForObject 物理不重叠) |
| A3 | 来源 URL 规范化 | ⬜ | 🟢 低 | grounding 重定向 URL(`vertexaisearch.../grounding-api-redirect/…`)→ 解析成干净出版方 URL |
| A4 | RSS 兜底盘 | ⭕ | 后续 | 已验证 19 源在 `space-feeds-verified.opml`;用 pubDate 保证"确定性新鲜+不漏",与 Gemini 结果去重合并 |
| A5 | X 账号接入 | ⭕ | 后续 | 官方 API(合规付费)或 Apify 爬(灰色)二选一 |
| A6 | 源清单维护机制 | ⭕ | 后续 | 偶尔(月/季)用 Claude 搜+验证刷新源,非日常 |

## B. 工作台/账号层侧(账号层 Phase 2,进行中)
| # | 项 | 状态 | 说明 |
|---|---|---|---|
| B1 | **Layer 1:UI 按空间从 DB 读真实内容** | 🔄【账】 | 真简报现已在库但界面看不到(UI 仍读 `phase1-fixtures`) |
| B2 | **按需搜索入口**(点对象→`ingestTrackingObject`→写→读出) | 🔄【账】 | 需先 merge `feature/news-ingestion@ae3f05d` 拿到 wrapper+space_id writer |
| B3 | **fixtures→DB 迁移**(非破坏性) | 🔄【账】 | 用 uuid5 派生 id,不碰已 seed 的真 SpaceX/真简报 |
| B4 | 入池/筛选(screening_decisions)持久化 | ⬜【账】 | 本期仍内存 |
| B5 | 选题卡(topic_cards)持久化 | ⬜【账】 | 本期仍内存;space_id 列已加 |

## C. 安全 / 运维
| # | 项 | 状态 | 优先级 | 说明 |
|---|---|---|---|---|
| C1 | **密钥轮换** | ⬜【用】 | 🔴 高 | 测试时 Gemini/DeepSeek/**Supabase service-role**/Vercel token 曾回显进对话记录。用户暂缓,service-role 最要紧。换后更新 .env.local + Vercel env + 重部署 |
| C2 | 清理测试残留 | ⬜【共】 | 🟢 低 | worktree `lhh-news-ingestion`(含 .env.local 副本)/ Vercel preview 项目 `lhh-news-ingestion` / 测试简报(建议留作 Layer 1 验证样本) |
| C3 | 生产部署决策 | ⬜【用】 | 🟡 中 | 正式域名?cron 是否正式开?Hobby(60s)还是 Pro(300s)?当前是测试 preview |
| C4 | 监控对象扩充 1→50-100 | ⬜【用】 | 🟡 中 | 现仅 1 条 SpaceX;需用户提供品牌清单并 seed(带 space_id) |

## D. 集成 / 协调
| # | 项 | 状态 | 说明 |
|---|---|---|---|
| D1 | account-layer merge `news-ingestion@ae3f05d` | 🔄【账】 | 拿到 space_id-aware writer + `ingestTrackingObject`,否则撞 NOT NULL |
| D2 | 多空间品牌分配逻辑 | ⬜【共】 | 现 tracking_objects 都归"聊太空";多空间真分配时按 space 走(代码已支持,无需改) |
| D3 | 错位提交 `1a66ad6` 收尾 | ⭕ | M4/M5 已 cherry-pick 到 news-ingestion(`4123ea5`),account-layer 上保留了原 `1a66ad6`;无害,集成时知悉 |

---

## 当前阻塞 / 等待
- **正在等**:账号层收尾 Phase 2(B1/B2/B3)→ ping 我 → 我做"真实 app 端到端验证 + A1 并行分批"。
- 期间我方不动任何东西(避免与账号层在共享工作区/分支碰撞)。

## 建议下一步顺序(账号层 Phase 2 完成后)
1. 真实 app 端到端验证(真简报在界面显示)。
2. **A1 并行/分批**(解锁 50-100 品牌)。
3. **C1 密钥轮换**(安全)。
4. C4 扩充监控对象 + C3 生产部署决策。
5. A2 分镜/脚本接 DeepSeek(后半段真实化)。
6. A3/A4/B4/B5 等增强。
