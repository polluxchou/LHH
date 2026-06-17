# x-search 事实核查接入「生成简报」— 设计 (2026-06-15)

> DeepSeek 生成的 `factSummary` 只是综述、无外部核验,可信度不足。生成简报时自动用 **xAI x-search**(grok-4.3 + x_search 工具)在 X 上核查信号说法,产出**佐证/矛盾结论 + 可信度 + 真实 X 证据帖**,挂到简报上。
> 分支:`feature/x-search-verify`(off `c81c902`)。**先试一下**:工作台「生成简报」路径、内存态、零 DB 改动、不硬限定账号。

## 0. 一句话
`generateBriefAction` 里 DeepSeek 出 `factSummary` 后,接一道 `verifyOnX`(调 `api.x.ai/v1/responses`,model `grok-4.3`,tool `{"type":"x_search"}`,带事件日期窗口)→ 解析成 `Verification{status,confidence,summary,evidence[]}` → 挂到简报 → UI 显示核查徽章 + 证据帖链接;失败降级为 `unverifiable`,不阻塞生成。

## 1. 背景与约束
- 现状:`factSummary` = DeepSeek 综合若干条目而成;DeepSeek 不可用时兜底为 `signal.summary` 原样复制。**无任何外部事实核验**。
- x-search 能力(已核实,见 xAI docs):keyword/semantic/user search + thread fetch over X;参数 `allowed_x_handles`/`excluded_x_handles`(≤20)、`from_date`/`to_date`(YYYY-MM-DD);返回 Grok grounded 回答 + `citations`(X 帖引用)。Grok-backed,需 model `grok-4.3`,Bearer `XAI_API_KEY`,endpoint `https://api.x.ai/v1/responses`。
- 局限:对"活在 X 上的事件"(公司/人物公告:SpaceX、Musk、Rocket Lab)核查强;对不在 X 的(监管文件、地方政策)弱 → 这类大概率 `unverifiable`,可接受。

## 2. 架构(镜像 `lib/ingest/deepseek-analyze.ts` 的纯函数 + 依赖注入)
新增 `lib/ingest/x-verify.ts`:
- `buildVerifyPrompt(claim, ctx): string` —— 指示 Grok 在 X 上核查 `claim`,**明确要求:优先凭官方/认证账号判断;给出 corroborated/disputed/contradicted/unverifiable 之一 + 1-2 句理由 + 0-1 可信度**;要求只输出 JSON(含 "json" 字样)。`ctx` 含 brand/subject、eventDate。
- `parseVerification(raw: string, citations: Citation[]): Verification` —— 解析 Grok 的 JSON 取 `status/confidence/summary`;`evidence` 由 `citations` 映射(handle/url/excerpt/official);坏 JSON / 非法 status / 空 → 返回 `{status:"unverifiable", confidence:0, summary:"X 核查未返回有效结果", evidence:[], checkedAt}`(守卫,同 `parseAnalysis` 风格,但不返回 null —— 永远给一个可挂的结果)。
- `verifyOnX(opts, deps?): Promise<Verification>` —— `opts={claim, brand, eventDate}`;`deps={search}` 可注入。默认 `search` = 调 xAI Responses API(见 §4)。失败(网络/超时/异常)→ catch 后返回 `unverifiable`。

## 3. `Verification` 类型(新增,放 **`lib/domain/types.ts`**;`x-verify.ts` 与 `EditorialBrief` 都 import 它 —— 保持依赖方向 ingest/domain→domain,避免循环)
```ts
export type VerificationStatus = "corroborated" | "disputed" | "contradicted" | "unverifiable";
export interface VerificationEvidence {
  handle: string;   // 发帖账号(无则空)
  url: string;      // 真实 X 帖链接(来自 citations)
  excerpt: string;  // 片段/标题(无则空)
  official: boolean; // Grok 判定是否官方/认证(无则 false)
}
export interface Verification {
  status: VerificationStatus;
  confidence: number;          // 0-1
  summary: string;             // 1-2 句核查结论
  evidence: VerificationEvidence[];
  checkedAt: string;           // ISO
}
```

## 4. 默认 search dep:xAI Responses API(薄、可注入、不单测)
- `VerifyDeps = { search: (prompt: string, opts: { fromDate?: string; toDate?: string }) => Promise<{ text: string; citations: Citation[] }> }`。
- 默认实现:`fetch("https://api.x.ai/v1/responses", { method:"POST", headers:{authorization:`Bearer ${process.env.XAI_API_KEY}`, "content-type":"application/json"}, body: JSON.stringify({ model:"grok-4.3", input: prompt, tools:[{ type:"x_search", from_date, to_date }] }) })` → 取 `text`(Grok 回答正文)+ `citations`(X 帖引用)。
- **实现时按 xAI Responses API 官方文档对齐确切字段名**(input/output_text/citations 的实际键),implementer 先 WebFetch `https://docs.x.ai` 的 Responses API 请求/响应示例再写默认 dep。`Citation` 形状以文档为准,内部用 `{url, title?, handle?}`。
- 日期窗口:`from_date = eventDate - 3 天`、`to_date = eventDate + 3 天`(eventDate 缺则不传,搜近期)。

## 5. 接入点(生成简报时自动)
`app/actions/generate-brief.ts` 的 `generateBriefAction`:现在 `analyzed = await analyzeBrief(...)`。在其后追加:
```
const verification = await verifyOnX({
  claim: `${analyzed.headline}。${analyzed.factSummary}`,
  brand: input.brand,
  eventDate: analyzed.eventDate,
});
return { ok: true, analyzed, verification };
```
- `GenerateBriefResult` 的 ok 分支加 `verification: Verification`。
- DeepSeek 失败(无 analyzed)时:可选仍核查 `signal.summary`,或直接跳过(本期跳过,无 analyzed 就不核查)。

## 6. 核查结果怎么挂到简报 / 影响它
- `EditorialBrief` 加可选字段 `verification?: Verification`(`lib/domain/types.ts`)。
- `generateBriefForSignal`/`buildZhBriefFields`(`lib/workflow/local-workflow.ts`)接收 `options.verification`,挂到 brief.verification。
- **对简报的影响(本期克制)**:不改 `factSummary` 本身;按 status 追加一条 riskNote:
  - `corroborated` → 「✅ X 核查:已获佐证(可信度 N%)」
  - `disputed` → 「⚠️ X 核查:未获官方佐证 / 说法存疑」
  - `contradicted` → 「❌ X 核查:X 上存在矛盾信息」
  - `unverifiable` → 「— X 核查:无 X 覆盖,未能核验」
  - (本期**不**自动改 ContentValueScore 分数;留作后续。)
- provider `generateBrief`:把 action 返回的 `verification` 透传给 `generateBriefForSignal(..., { verification })`;失败/无则不传。

## 7. UI(最小附加)
简报详情面板加一块「事实核查」:status 徽章(颜色按 status)+ `summary` 一句 + `evidence` 证据帖列表(handle + 可点 X 链接)。无 verification 时不显示该块。(账号层 UI territory → 最小附加,改动集中在简报详情组件;若与其活跃改动撞,协调。)

## 8. 失败 / 降级
- x-search 网络/超时/异常/坏 JSON → `verifyOnX` 返回 `unverifiable`,简报照常生成(不阻塞)。
- `XAI_API_KEY` 缺失 → 默认 search dep 抛错被 catch → `unverifiable` + 一次 `console.warn`(不泄露 key)。
- 错误信息脱敏,不回显 key/堆栈。

## 9. 凭据 / 成本
- 新 env:**`XAI_API_KEY`**(server 端,放 `.env.local` + Vercel env)。
- +1 次 grok-4.3 调用 / 简报生成(用户已接受)。

## 10. 测试(镜像 `tests/ingest`)
- `tests/ingest/x-verify.test.ts`:
  - `buildVerifyPrompt`:含 claim、含"优先官方/认证账号"指示、含 "json" 字样。
  - `parseVerification`:合法 JSON+citations → 正确 Verification;坏 JSON / 非法 status / 空 → `unverifiable`;evidence 由 citations 正确映射。
  - `verifyOnX`:注入 mock search 返回好结果 → 对应 Verification;mock 抛错 → `unverifiable`。
- 全绿 + tsc + build。

## 11. 范围 / 非目标(YAGNI)
- **做**:x-verify 模块 + 接 `generateBriefAction` + 简报挂 verification + riskNote + 最小 UI。内存态,工作台「生成简报」即见。
- **不做(后续)**:DB 持久化(editorial_briefs 加 jsonb 列,账号层协调)、抓取管道自动核查、`allowed_x_handles` 硬限定(每对象官方账号清单)、用核查结果自动改打分、图/视频理解。
