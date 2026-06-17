# X-Search 事实核查 — 产品设计与技术实现总结(2026-06-18)

> 给候选信号/简报加一道**外部事实核验**:生成简报时自动用 xAI x-search 在 X(Twitter)上核查说法,产出"佐证/矛盾结论 + 可信度 + 真实证据帖",挂到简报。
> 配套:设计 spec `docs/superpowers/specs/2026-06-15-x-search-verify-design.md`、实现计划 `docs/superpowers/plans/2026-06-15-x-search-verify.md`。代码已 rebase 到 main 并推送(`03d7fe1`,分支 `feature/x-search-verify`)。

## 0. 为什么做
现状:简报的 `factSummary` 是 **DeepSeek 把若干来源综述**而成(DeepSeek 不可用时兜底为信号 `summary` 原样复制),**没有任何外部事实核验**——"AI 说它是真的"而已,可信度不足。X 上有当事方(公司/人物)的一手发声,适合用来交叉核查。

---

## 1. 产品设计(brainstorming 拍板的几个决策)

| 决策点 | 选定 | 备选 / 理由 |
|---|---|---|
| **核查产出** | 佐证 + 置信度 + 证据帖(核查结论) | 而非"只补一手主源"或"只做辟谣";直接补"可信度"这一环 |
| **触发时机** | **生成简报时自动** | 而非按需按钮 / 抓取管道每条;一步到位,每次生成 +1 次 Grok 调用(用户接受) |
| **可信度来源** | **不限账号起步 + prompt 要求 Grok 优先官方/认证账号判断** | 而非硬限定 `allowed_x_handles`;零配置、不动 schema、先试;后续可升级为每对象官方账号清单 |
| **对简报的影响** | 挂 `verification` + 按状态加一条 riskNote;**本期不改"价值打分"** | 克制、可控;`contradicted` 仅提示,不自动压分(留后续) |
| **UI** | 简报**详情弹窗**里一个「事实核查」块(徽章 + 结论 + 证据帖链接) | 内联卡片暂不显示(见 §4 注意) |
| **持久化** | **内存态**(随 workflow state 流到 UI,刷新丢) | 零 DB 改动、最快试;后续再加 jsonb 列 |

**四种核查状态**:`corroborated`(已获官方/可信佐证)· `disputed`(无官方佐证 / 存疑)· `contradicted`(X 上有可信信息矛盾)· `unverifiable`(X 无覆盖 / 调用失败,不可核验)。

---

## 2. 技术实现

### 2.1 x-search = xAI 的 X Search 工具
- 端点 `POST https://api.x.ai/v1/responses`,Bearer `XAI_API_KEY`,**model `grok-4.3`**,工具 `{"type":"x_search"}`。
- 请求体:`input` 是**消息数组** `[{role:"user", content: prompt}]`;工具参数支持 `from_date`/`to_date`(YYYY-MM-DD)、`allowed_x_handles`/`excluded_x_handles`(≤20)、图/视频理解。
- 响应:正文在 **`output[].content[].text`**(`type:"output_text"` 块);引用在**顶层 `citations`**(X 帖)。
- 本质:Grok 带 X 搜索工具的"grounding",由模型搜 + 判 + 给引用。

### 2.2 模块架构(`lib/ingest/x-verify.ts`,纯函数 + 依赖注入,镜像 `deepseek-analyze.ts`)
- `buildVerifyPrompt(claim, {brand, eventDate})` —— 让 Grok 在 X 上核查 claim,**明确要求优先官方/认证账号**,输出固定 JSON `{status, confidence, summary}`。
- `parseVerification(raw, citations, {checkedAt})` —— 解析 Grok 的 JSON + 把 `citations` 映射成 `evidence[]`;坏 JSON / 非法 status / 空 → `unverifiable`(**永不抛、永不返回 null**;confidence 夹 [0,1])。
- `verifyOnX(opts, deps?, now?)` —— 编排:build prompt → 调可注入的 `deps.search`(默认调 xAI,带 `eventDate ± 3 天` 窗口)→ parse。**任何异常(含网络/超时/注入的 now 抛错)都兜成 `unverifiable`,绝不抛出**。
- 默认 `search` dep 封装真实 fetch(key 不出后端);单测全用 mock,不依赖真 API。

### 2.3 `Verification` 类型(`lib/domain/types.ts`)
```ts
type VerificationStatus = "corroborated" | "disputed" | "contradicted" | "unverifiable";
interface VerificationEvidence { handle: string; url: string; excerpt: string; official: boolean; }
interface Verification { status; confidence: number; summary: string; evidence: VerificationEvidence[]; checkedAt: string; }
// EditorialBrief 加可选字段 verification?: Verification
```

### 2.4 数据流
```
工作台点「生成简报」
 → generateBrief (workflow-provider)
 → generateBriefAction (server action)
    → analyzeBrief (DeepSeek) 出 factSummary
    → verifyOnX({claim: headline+factSummary, brand, eventDate})  ← 新增
    → 返回 { ok, analyzed, verification }
 → generateBriefForSignal(..., { ai, verification })
    → buildZhBriefFields 把 verification 挂到 brief + 按 status 追加 riskNote
 → 简报详情弹窗(brief-preview-dialog)渲染「事实核查」块
```

### 2.5 失败降级(永不阻塞)
- x-search 失败 / 无 X 覆盖 / 坏 JSON / 缺 key → `unverifiable`,**简报照常生成**,只标"未核验"。错误信息脱敏,不回显 key。

### 2.6 改动文件(6 个,+257 行)
- 新增:`lib/ingest/x-verify.ts`(引擎)、`tests/ingest/x-verify.test.ts`、`tests/ingest/x-verify-brief.test.ts`
- 改:`lib/domain/types.ts`(类型)、`lib/workflow/local-workflow.ts`(挂 verification + riskNote)、`app/actions/generate-brief.ts`(接 verifyOnX)、`components/workbench/workflow-provider.tsx`(透传)、`components/workbench/brief-preview-dialog.tsx`(UI 块)

### 2.7 测试
- 12 个 x-verify 单测(prompt 内容 / parse 好坏 JSON / status 守卫 / confidence 夹取 / verifyOnX 注入成功 / 抛错降级 / 日期窗口 / 无日期不带窗口)+ 3 个简报挂载测试。
- rebase 到 main 后全量 **213 测试绿、tsc 干净、build 通过**。

---

## 3. 状态(2026-06-18)
- ✅ 实现完成,子代理驱动 8 任务 + 两段式审查(审查抓到并修了一个 riskNotes 回归)。
- ✅ rebase 到当前 main **零冲突**(虽然 main 在 token-cost/文章生成线大改了同样文件,但增量不重叠),推送 `03d7fe1`,Vercel 自动部署。
- ✅ **xAI API + 请求/响应形状 + key 已用 curl 直连验证(HTTP 200)**,响应正文/citations 字段与解析器一致。
- ⚠️ **本机 `api.x.ai` 被国内 DNS 污染连不上**(Node fetch → Facebook 段 IP → ConnectTimeout,**和 Gemini 同病**)→ 真调用只能在 **Vercel(美国)** 跑。
- ⚠️ 真调用需 **Vercel 环境变量 `XAI_API_KEY`**(本地 .env.local 已配)。

---

## 4. 已知局限 / 注意
1. **核查块在「详情」弹窗,不在内联简报卡**(X8 改的是 `brief-preview-dialog`)。在内联卡看不到核查结果是正常的,点「⤢ 详情」才有。
2. **强弱用例差别大**:x-search 对"**活在 X 上的主体 + 近期事件**"(SpaceX / Musk / Rocket Lab 等)核查强;对**X 上几乎无存在感的主体**(如私营紧固件公司 Würth)或**久远事件日期**,大概率 `unverifiable`(X 无覆盖)——不是 bug,是数据现实。验证时用 SpaceX 类近期信号才看得出价值。
3. **内存态**:verification 不入库,刷新丢失。
4. **`official` 标记 v1 统一 false**("优先官方"体现在 Grok 的判定里,不逐条标)。
5. **抓取管道(A1)未接核查**:目前只在工作台「生成简报」这条路核查;A1 日更管道产出的简报暂不自动核查。

---

## 5. 后续增强(非本期)
- **每对象官方账号硬限定**:tracking_objects 加 `x_handles`,核查时传 `allowed_x_handles` → 最高可信度。
- **核查结果自动调打分**:`contradicted` 压低推荐分 / `corroborated` 加分。
- **DB 持久化**:editorial_briefs 加 jsonb 列存 verification(账号层协调)。
- **抓取管道自动核查**:A1 worker 产出简报后自动接 verifyOnX。
- **内联卡片也显示核查徽章**:不止详情弹窗。
- **可信度兜底**:本机调试用代理 / 或全部依赖 Vercel。
