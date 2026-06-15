# A2 · 分镜/脚本接 DeepSeek 真生成 — 设计 (2026-06-15)

> 把工作台「生产工作室」的脚本 + 分镜从 `createStubProduction` 纯模板,升级为 **DeepSeek 真实生成**,保留二次编辑与确定性兜底。隶属 news-ingestion 后半段真实化(remaining 文档 A2)。

## 0. 一句话
生产工作室点「AI 生成脚本/分镜」→ 取简报+选题卡 → DeepSeek 一次产出 `script.sections` + `storyboard` 的 JSON → 写进 `ProductionPackage` → 现有编辑/重置照常。失败回退 stub。

## 1. 范围与边界
- **交付**:引擎 + UI 全链路(用户已定)。手动按钮触发(非自动,控成本)。
- **生成**:`script.sections`(开场钩子 / 背景 / 为什么重要 / 收束,带时间轴)+ `storyboard`(分镜表)。**单次 DeepSeek 调用产出一份含两者的 JSON**,分镜对齐脚本节拍,连贯且省一半 token/延迟。
- **不生成(保持确定性脚手架)**:`task`(checklist/owner/deadline/channel/budget)= 运营样板,无 LLM 价值,继续由代码拼。`targetDuration` 取自选题卡 `formatLabel`,`wordCount` 由生成正文统计。
- **不动**:`ProductionPackage` / `ProductionScript` / `StoryboardShot` 等 `lib/domain/production.ts` 类型(产出必须贴合现有 shape,这样 UI 与编辑器零改动)。

## 2. 架构(镜像 `lib/ingest`:纯函数 + 依赖注入)
### 2.1 生成引擎 `lib/production/deepseek-script.ts`(新增,纯、我的)
- `buildScriptPrompt(brief: EditorialBrief, topicCard?: TopicCard | null): string`
  - 喂入:`brief.briefTitle / tagline / factBullets / factSummary / whyItMatters`,`topicCard.coreQuestion / formatLabel / workingTitle`。
  - **整份 `b-cna-01` 生产包(script+storyboard,~5.8KB)作为 few-shot 范本**直接嵌入 prompt(已确认体量可放进 DeepSeek 上下文),让产出向其叙事密度与「林哈哈」口吻看齐。
  - prompt 必含 "json" 字样(DeepSeek json_object 模式要求)。
  - 明确要求:中文;**4 个脚本段固定 `id` = `hook|context|core|close`**(stub 与精品一致);分镜每条含 `n/time/shot/voiceOver/visual/notes`,**分镜条数随目标时长伸缩**(参照精品 12-15min→10 条;约每 60-90s 一条,不写死)。`time`/`duration` 要铺满 `targetDuration`。
- `parseProduction(raw: string): { script: ProductionScript; storyboard: StoryboardShot[] } | null`
  - 解析 + 校验:`script.sections` 恰 4 段且 id 命中 `hook|context|core|close`、`body` 非空;`storyboard` **≥6 条**且每条字段(`n/time/shot/voiceOver/visual/notes`)非空、`n` 连续。任一不满足 → 返回 `null`(守卫,同 `parseAnalysis`)。`script.targetDuration`/`wordCount` 不由模型给,在 `generateProduction` 组装时补(targetDuration 从 formatLabel 解析,wordCount 统计 sections 正文)。
- `generateProduction(opts, deps?): Promise<ProductionPackage>`
  - `opts = { brief, topicCard, formatLabel? }`;`deps = { chat }`(可注入 DeepSeek client,默认 `deepseek-v4-flash` + `response_format:{type:"json_object"}`,baseURL `https://api.deepseek.com`)。
  - 组装:DeepSeek 产出的 script+storyboard + 确定性 `task` 脚手架(复用 `createStubProduction` 里 task 段逻辑,抽成 `buildTaskScaffold(brief, topicCard)` 共用)。
  - `parseProduction` 返回 null → **抛错**,由调用方决定回退。

### 2.2 异步入口 server action `app/actions/generate-production.ts`(新增,我的)
- `generateProductionAction(briefId): Promise<{ ok: true; pkg: ProductionPackage } | { ok: false; reason: string }>`
- 取 brief + 关联 topicCard(来源同 reducer:`sourceEditorialBriefId === briefId`)→ 调 `generateProduction` → 成功返回 pkg;失败 catch → `{ ok:false, reason }`(由 UI 回退 stub + run log 记错)。
- 用 service-role 客户端读 brief(若数据已在 DB);过渡期也可由调用侧把 brief/topicCard 传入,避免耦合数据源。

### 2.3 同步 reducer(`lib/workflow/local-workflow.ts`,clean、我的)
- 新增 `setProductionDraft(state, briefId, pkg): LocalWorkflowState` — 仅把 pkg 写进 `productionDrafts[briefId]`(复用 `withProductionDraft`)。
- `ensureProductionDraft` / `resetProductionDraft` / `updateScriptSection` / `updateStoryboardShot` / `toggleProductionChecklistItem` **全部不变**。
- `createStubProduction` **保留**为兜底与即时开窗。

### 2.4 UI(`components/workbench/production-studio.tsx` clean + `workflow-provider.tsx` ⚠️一处 collision)
- `production-studio.tsx`:加「AI 生成脚本/分镜」按钮 + loading/disabled 态 + 失败提示。点击 → 调 provider 的 `generateProduction(briefId)`。
- `workflow-provider.tsx`(账号层在改):新增 `generateProduction: (briefId) => Promise<void>` —— 调 `generateProductionAction` → 成功 `setState(s => setProductionDraft(s, briefId, pkg))` + run log 成功;失败 → run log 记错、保留现有 stub 草稿。约 8 行,additive,合并时 trivial 冲突。

## 3. 数据流
```
[生产工作室] 点「AI 生成」
  → workflow-provider.generateProduction(briefId)
  → generateProductionAction(briefId)
     → 取 brief + topicCard
     → generateProduction({brief,topicCard})
        → buildScriptPrompt → DeepSeek(json_object) → parseProduction
        → + buildTaskScaffold → ProductionPackage
  → 成功: setProductionDraft(state, briefId, pkg) + runLog("AI 生成成功")
  → 失败: 保留 stub 草稿 + runLog("AI 生成失败, 已保留模板草稿: <reason>")
[现有] updateScriptSection / updateStoryboardShot / toggleChecklist / resetProduction 照常
```

## 4. 错误处理
- DeepSeek 超时/网络/非法 JSON/校验失败 → action 返回 `{ok:false}`,UI 不破坏既有草稿,run log 留痕。
- **DeepSeek 国内本机可达**(不像 Gemini)→ A2 整链路**本地即可端到端验证**,无需上 Vercel。
- 不吞密钥:错误信息脱敏,不回显 key。

## 5. 测试(镜像 `tests/ingest`)
- `tests/production/deepseek-script.test.ts`:
  - `buildScriptPrompt` 含关键事实 + coreQuestion + "json" 字样 + 固定段 id 要求。
  - `parseProduction`:合法 JSON → 正确结构;缺段/空 body/坏 JSON/分镜空 → `null`。
  - `generateProduction`:注入 mock `chat` 返回精品级 JSON → 得到合法 `ProductionPackage`(script+storyboard 来自模型、task 来自脚手架);mock 返回坏 JSON → 抛错。
- reducer:`setProductionDraft` 写入正确、不影响其他 brief。
- 全绿 + `tsc` + `build` 通过。

## 6. 协调 / 集成
- **唯一 collision**:`workflow-provider.tsx`(账号层活跃编辑)。策略:在我 worktree 完成全部改动并自测;合并时 `generateProduction` 方法为 additive,手解一处即可(同 D1 的 package.json 量级)。**不**在账号层活跃 dirty checkout 上直接改。
- 其余文件(新增 lib/production 模块、server action、production-studio、local-workflow reducer、测试)均 clean、归我。
- 安全护栏:只读真库、写库用 service-role;不在共享活跃 checkout 上动手。

## 7. 非目标(YAGNI)
- 不做自动触发 / 批量生成 / 多版本对比 / task 段 LLM 化。
- 不改 `ProductionPackage` 类型。
- 不接入 DB 持久化生产包(归账号层 Phase 2 后续 B5 一类,本期生产草稿仍随 workflow state)。
