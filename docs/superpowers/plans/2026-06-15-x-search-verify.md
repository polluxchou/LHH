# x-search 事实核查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 生成简报时自动用 xAI x-search 在 X 上核查信号说法,产出佐证/矛盾结论 + 可信度 + 真实证据帖,挂到简报。

**Architecture:** 纯函数 + 依赖注入(镜像 `lib/ingest/deepseek-analyze.ts`)。`verifyOnX` 默认调 `api.x.ai/v1/responses`(grok-4.3 + x_search);失败/无覆盖降级 `unverifiable`,不阻塞生成。先试阶段:工作台「生成简报」路径、内存态、零 DB。

**Tech Stack:** Next.js 15 · TypeScript · xAI Responses API(`grok-4.3`,`x_search` 工具)· vitest。

**Worktree:** `/Users/fengzhou/Code/lhh-x-verify`(分支 `feature/x-search-verify`,off `c81c902`)。`node_modules`/`.env.local` 已软链。**精确 `git add <file>`,绝不 `git add -A`。** 测试 `npx vitest run <path>`;类型 `npx tsc --noEmit`。

**Spec:** `docs/superpowers/specs/2026-06-15-x-search-verify-design.md`。

---

## Task 1: `Verification` 类型 + `EditorialBrief.verification?` 字段

**Files:** Modify `lib/domain/types.ts`

- [ ] **Step 1: 加类型 + 字段**

在 `lib/domain/types.ts` 加(放在 `EditorialBrief` 之前或之后均可):
```ts
export type VerificationStatus = "corroborated" | "disputed" | "contradicted" | "unverifiable";

export interface VerificationEvidence {
  handle: string;
  url: string;
  excerpt: string;
  official: boolean;
}

export interface Verification {
  status: VerificationStatus;
  confidence: number; // 0-1
  summary: string;
  evidence: VerificationEvidence[];
  checkedAt: string; // ISO
}
```
在 `EditorialBrief` 接口末尾(`createdAt` 后)加:
```ts
  /** X 事实核查结果(生成简报时由 x-search 产出;可选,内存态) */
  verification?: Verification;
```

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit` → clean。

- [ ] **Step 3: 提交**

```bash
git add lib/domain/types.ts
git commit -m "feat: Verification type + EditorialBrief.verification field"
```

---

## Task 2: `buildVerifyPrompt`(纯函数)

**Files:** Create `lib/ingest/x-verify.ts` · Test `tests/ingest/x-verify.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/ingest/x-verify.test.ts
import { describe, it, expect } from "vitest";
import { buildVerifyPrompt } from "@/lib/ingest/x-verify";

describe("buildVerifyPrompt", () => {
  const p = buildVerifyPrompt("SpaceX 完成第35次复用", { brand: "SpaceX", eventDate: "2026-06-13" });
  it("含待核说法与品牌", () => {
    expect(p).toContain("SpaceX 完成第35次复用");
    expect(p).toContain("SpaceX");
  });
  it("要求优先官方/认证账号", () => {
    expect(p).toContain("官方");
    expect(p).toContain("认证");
  });
  it("含四种 status 取值与 json 指示", () => {
    expect(p).toContain("corroborated");
    expect(p).toContain("contradicted");
    expect(p).toContain("unverifiable");
    expect(p.toLowerCase()).toContain("json");
  });
  it("有事件日期时带上", () => {
    expect(p).toContain("2026-06-13");
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `npx vitest run tests/ingest/x-verify.test.ts` → FAIL(模块不存在)。

- [ ] **Step 3: 实现**

```ts
// lib/ingest/x-verify.ts
import type { Verification, VerificationStatus, VerificationEvidence } from "@/lib/domain/types";

const STATUSES: VerificationStatus[] = ["corroborated", "disputed", "contradicted", "unverifiable"];

export interface Citation {
  url: string;
  title?: string;
  handle?: string;
}

export function buildVerifyPrompt(claim: string, ctx: { brand: string; eventDate: string | null }): string {
  return [
    `你是事实核查员。请在 X(Twitter)上核查下面这条关于「${ctx.brand}」的说法是否属实。`,
    `【待核说法】${claim}`,
    ctx.eventDate ? `【事件日期】${ctx.eventDate}` : ``,
    ``,
    `要求:`,
    `1. 优先依据官方/认证账号(蓝标、当事机构或人物本人)的帖子判断;普通账号仅作参考。`,
    `2. 结论取以下之一:corroborated(有官方/可信佐证)| disputed(无官方佐证或说法存疑)| contradicted(X 上有可信信息与之矛盾)| unverifiable(X 上无相关覆盖、无法核验)。`,
    `3. 只输出一个 JSON 对象(不要解释、不要 markdown 代码块):`,
    `{"status":"corroborated|disputed|contradicted|unverifiable","confidence":0.0,"summary":"1-2 句中文核查结论"}`,
  ]
    .filter(Boolean)
    .join("\n");
}
```
(`STATUSES` / `Citation` / type imports 在 Task 3/4 用到,此处先引入。)

- [ ] **Step 4: 跑测试** — PASS。
- [ ] **Step 5: 提交**
```bash
git add lib/ingest/x-verify.ts tests/ingest/x-verify.test.ts
git commit -m "feat: buildVerifyPrompt for X fact-check"
```

---

## Task 3: `parseVerification`(守卫 + citations→evidence)

**Files:** Modify `lib/ingest/x-verify.ts` · Test `tests/ingest/x-verify.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
import { parseVerification, type Citation } from "@/lib/ingest/x-verify";

const cites: Citation[] = [{ url: "https://x.com/SpaceX/status/1", title: "Falcon 9 booster ... 35th flight", handle: "SpaceX" }];
const AT = "2026-06-15T00:00:00.000Z";

describe("parseVerification", () => {
  it("合法 JSON + citations → 正确 Verification", () => {
    const v = parseVerification(JSON.stringify({ status: "corroborated", confidence: 0.9, summary: "官方已确认" }), cites, { checkedAt: AT });
    expect(v.status).toBe("corroborated");
    expect(v.confidence).toBeCloseTo(0.9);
    expect(v.summary).toBe("官方已确认");
    expect(v.evidence).toHaveLength(1);
    expect(v.evidence[0].url).toBe("https://x.com/SpaceX/status/1");
    expect(v.evidence[0].handle).toBe("SpaceX");
    expect(v.checkedAt).toBe(AT);
  });
  it("坏 JSON → unverifiable(仍保留 evidence)", () => {
    const v = parseVerification("not json", cites, { checkedAt: AT });
    expect(v.status).toBe("unverifiable");
    expect(v.evidence).toHaveLength(1);
  });
  it("非法 status → unverifiable", () => {
    const v = parseVerification(JSON.stringify({ status: "true", confidence: 1, summary: "x" }), [], { checkedAt: AT });
    expect(v.status).toBe("unverifiable");
  });
  it("confidence 夹到 0-1", () => {
    const v = parseVerification(JSON.stringify({ status: "disputed", confidence: 5, summary: "x" }), [], { checkedAt: AT });
    expect(v.confidence).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现(追加到 x-verify.ts)**

```ts
function nonEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function evidenceFrom(citations: Citation[]): VerificationEvidence[] {
  return (citations ?? [])
    .map((c) => ({ handle: nonEmpty(c.handle), url: nonEmpty(c.url), excerpt: nonEmpty(c.title), official: false }))
    .filter((e) => e.url);
}

export function parseVerification(
  raw: string,
  citations: Citation[],
  opts: { checkedAt: string },
): Verification {
  const evidence = evidenceFrom(citations);
  const fallback = (summary: string): Verification => ({
    status: "unverifiable",
    confidence: 0,
    summary,
    evidence,
    checkedAt: opts.checkedAt,
  });

  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return fallback("X 核查未返回有效 JSON");
  }
  if (!o || typeof o !== "object" || !STATUSES.includes(o.status as VerificationStatus)) {
    return fallback("X 核查状态非法或缺失");
  }
  return {
    status: o.status as VerificationStatus,
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0)),
    summary: nonEmpty(o.summary) || "(无结论)",
    evidence,
    checkedAt: opts.checkedAt,
  };
}
```

- [ ] **Step 4: 跑测试** — PASS。 **Step 5: 提交**
```bash
git add lib/ingest/x-verify.ts tests/ingest/x-verify.test.ts
git commit -m "feat: parseVerification guard + citations to evidence"
```

---

## Task 4: `verifyOnX`(注入 + 默认 xAI dep + 日期窗口)

**Files:** Modify `lib/ingest/x-verify.ts` · Test `tests/ingest/x-verify.test.ts`

> 默认 dep 调 xAI Responses API。**实现前先 WebFetch `https://docs.x.ai/developers/tools/x-search` 与其 Responses API 示例,核实请求体(input/tools 嵌套)与响应里正文 + citations 的确切字段名**,据此写默认 dep 的解析。dep 可注入,所以单测用 mock、不依赖真 API。

- [ ] **Step 1: 追加失败测试**

```ts
import { verifyOnX, type VerifyDeps } from "@/lib/ingest/x-verify";

describe("verifyOnX", () => {
  const okSearch: VerifyDeps["search"] = async () => ({
    text: JSON.stringify({ status: "corroborated", confidence: 0.8, summary: "官方账号已发帖确认" }),
    citations: [{ url: "https://x.com/SpaceX/status/1", title: "...", handle: "SpaceX" }],
  });

  it("注入 mock → 对应 Verification", async () => {
    const v = await verifyOnX(
      { claim: "SpaceX 第35次复用", brand: "SpaceX", eventDate: "2026-06-13" },
      { search: okSearch },
      () => "2026-06-15T00:00:00.000Z",
    );
    expect(v.status).toBe("corroborated");
    expect(v.evidence[0].handle).toBe("SpaceX");
    expect(v.checkedAt).toBe("2026-06-15T00:00:00.000Z");
  });

  it("search 抛错 → unverifiable(不抛出)", async () => {
    const v = await verifyOnX(
      { claim: "x", brand: "y", eventDate: null },
      { search: async () => { throw new Error("network"); } },
      () => "2026-06-15T00:00:00.000Z",
    );
    expect(v.status).toBe("unverifiable");
    expect(v.checkedAt).toBe("2026-06-15T00:00:00.000Z");
  });

  it("传入事件日期 → search 收到 ±3 天窗口", async () => {
    let got: { fromDate?: string; toDate?: string } = {};
    await verifyOnX(
      { claim: "x", brand: "y", eventDate: "2026-06-13" },
      { search: async (_p, opts) => { got = opts; return { text: "{}", citations: [] }; } },
      () => "AT",
    );
    expect(got.fromDate).toBe("2026-06-10");
    expect(got.toDate).toBe("2026-06-16");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现(追加到 x-verify.ts)**

```ts
export interface VerifyDeps {
  search: (prompt: string, opts: { fromDate?: string; toDate?: string }) => Promise<{ text: string; citations: Citation[] }>;
}

/** eventDate ± days,返回 YYYY-MM-DD;无 eventDate 返回 undefined。 */
function shiftDate(eventDate: string | null, days: number): string | undefined {
  if (!eventDate) return undefined;
  const d = new Date(`${eventDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function defaultDeps(): VerifyDeps {
  return {
    search: async (prompt, opts) => {
      const res = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.XAI_API_KEY ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "grok-4.3",
          input: prompt,
          tools: [{ type: "x_search", ...(opts.fromDate ? { from_date: opts.fromDate } : {}), ...(opts.toDate ? { to_date: opts.toDate } : {}) }],
        }),
      });
      if (!res.ok) throw new Error(`x-search HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      // NOTE: 按 xAI Responses API 文档对齐;以下取值在实现时核对真实字段名。
      const text = extractText(data);
      const citations = extractCitations(data);
      return { text, citations };
    },
  };
}

// 这两个抽取函数按 xAI 文档实现(WebFetch 后填);各自带防御性默认(无则空串/空数组)。
function extractText(data: Record<string, unknown>): string {
  // 占位形状,实现时按文档校正:常见为 data.output_text 或 data.output[].content[].text
  return typeof (data as { output_text?: unknown }).output_text === "string"
    ? (data as { output_text: string }).output_text
    : "";
}
function extractCitations(data: Record<string, unknown>): Citation[] {
  const raw = (data as { citations?: unknown }).citations;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => (typeof c === "string" ? { url: c } : (c as Citation)))
    .filter((c) => c && typeof c.url === "string");
}

export async function verifyOnX(
  opts: { claim: string; brand: string; eventDate: string | null },
  deps: VerifyDeps = defaultDeps(),
  now: () => string = () => new Date().toISOString(),
): Promise<Verification> {
  const checkedAt = now();
  try {
    const prompt = buildVerifyPrompt(opts.claim, { brand: opts.brand, eventDate: opts.eventDate });
    const result = await deps.search(prompt, {
      fromDate: shiftDate(opts.eventDate, -3),
      toDate: shiftDate(opts.eventDate, 3),
    });
    return parseVerification(result.text, result.citations, { checkedAt });
  } catch {
    return { status: "unverifiable", confidence: 0, summary: "X 核查调用失败", evidence: [], checkedAt };
  }
}
```
> `extractText`/`extractCitations` 的占位形状必须在实现时按 xAI 文档核正(WebFetch);若文档示例与占位不符,改这两个函数即可,`verifyOnX`/`parseVerification` 不动。

- [ ] **Step 4: 跑测试 + tsc** — `npx vitest run tests/ingest/x-verify.test.ts && npx tsc --noEmit` → PASS/clean。
- [ ] **Step 5: 提交**
```bash
git add lib/ingest/x-verify.ts tests/ingest/x-verify.test.ts
git commit -m "feat: verifyOnX with injectable xAI x-search dep + date window"
```

---

## Task 5: 简报挂 verification + 按 status 加 riskNote

**Files:** Modify `lib/workflow/local-workflow.ts` · Test `tests/ingest/x-verify-brief.test.ts`

> `generateBriefForSignal(state, signalId, options)` → `GenerateBriefOptions` 已有 `ai?`,加 `verification?: Verification`;`buildZhBriefFields(generated, signal, sources, subjectName, ai, verification?)` 把它挂到 brief 并按 status 追加 riskNote。

- [ ] **Step 1: 写失败测试**(以 buildZhBriefFields 不易直接调,改测 generateBriefForSignal 的产出;若 buildZhBriefFields 是模块私有,测试通过 generateBriefForSignal 走到它。需要一个含 1 条候选信号的最小 state——复用项目既有测试夹具/构造器;若无,测 buildZhBriefFields 需临时 export 它)

```ts
// tests/ingest/x-verify-brief.test.ts
import { describe, it, expect } from "vitest";
import { buildZhBriefFields } from "@/lib/workflow/local-workflow";
import type { EditorialBrief, CandidateSignal, Verification } from "@/lib/domain/types";

const generated = { riskNotes: ["原有风险"], factSummary: "fs" } as unknown as EditorialBrief;
const signal = { signalType: "technical_project_milestone", confidence: 0.8, summary: "s", eventDate: "2026-06-13", sourceIds: [] } as unknown as CandidateSignal;
const v: Verification = { status: "corroborated", confidence: 0.9, summary: "官方已确认", evidence: [], checkedAt: "AT" };

describe("buildZhBriefFields with verification", () => {
  it("挂上 verification + corroborated 追加 ✅ riskNote", () => {
    const brief = buildZhBriefFields(generated, signal, [], "SpaceX", undefined, v);
    expect(brief.verification?.status).toBe("corroborated");
    expect(brief.riskNotes.some((r) => r.includes("X 核查") && r.includes("佐证"))).toBe(true);
  });
  it("contradicted 追加 ❌ riskNote", () => {
    const brief = buildZhBriefFields(generated, signal, [], "SpaceX", undefined, { ...v, status: "contradicted" });
    expect(brief.riskNotes.some((r) => r.includes("矛盾"))).toBe(true);
  });
  it("无 verification 时不加核查 riskNote、verification 为 undefined", () => {
    const brief = buildZhBriefFields(generated, signal, [], "SpaceX", undefined, undefined);
    expect(brief.verification).toBeUndefined();
    expect(brief.riskNotes.some((r) => r.includes("X 核查"))).toBe(false);
  });
});
```
> 若 `buildZhBriefFields` 当前非 export:本任务把它改为 `export`(它已是文件内函数,加 `export` 关键字即可),便于测试。

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

1. `GenerateBriefOptions` 加 `verification?: Verification;`(import `Verification` from `@/lib/domain/types`)。
2. `generateBriefForSignal` 把 `options.verification` 透传给 `buildZhBriefFields`(zh 分支调用处加实参;en 分支可不接,保持 `generated`)。
3. `buildZhBriefFields` 签名末尾加 `verification?: Verification`,并 `export`。在两个 return(有 ai / 无 ai)上都:
```ts
   const vNote = verification ? [verificationRiskNote(verification)] : [];
   // ...return 对象里 riskNotes 改为 [...原 riskNotes, ...vNote],并加 verification,
```
4. 新增 `verificationRiskNote`:
```ts
function verificationRiskNote(v: Verification): string {
  const pct = Math.round(v.confidence * 100);
  switch (v.status) {
    case "corroborated": return `✅ X 核查:已获佐证(可信度 ${pct}%)`;
    case "disputed": return `⚠️ X 核查:未获官方佐证 / 说法存疑`;
    case "contradicted": return `❌ X 核查:X 上存在矛盾信息`;
    default: return `— X 核查:无 X 覆盖,未能核验`;
  }
}
```
   两个 return 对象都加 `verification,`(把入参挂上)。

- [ ] **Step 4: 跑测试 + 全量 + tsc** — `npx vitest run && npx tsc --noEmit` → 全绿/clean。
- [ ] **Step 5: 提交**
```bash
git add lib/workflow/local-workflow.ts tests/ingest/x-verify-brief.test.ts
git commit -m "feat: attach verification to brief + status-based riskNote"
```

---

## Task 6: `generateBriefAction` 接 verifyOnX

**Files:** Modify `app/actions/generate-brief.ts`

- [ ] **Step 1: 改 result 类型 + 调 verifyOnX**

```ts
import { verifyOnX } from "@/lib/ingest/x-verify";
import type { Verification } from "@/lib/domain/types";

export type GenerateBriefResult =
  | { ok: true; analyzed: AnalyzedBrief; verification: Verification }
  | { ok: false; reason: string };
```
在 `const analyzed = await analyzeBrief(...)` 成功(非 null)之后、return 之前:
```ts
    const verification = await verifyOnX({
      claim: `${analyzed.headline}。${analyzed.factSummary}`,
      brand: input.brand,
      eventDate: analyzed.eventDate,
    });
    return { ok: true, analyzed, verification };
```
(`verifyOnX` 自带失败降级,不会抛;不需要额外 try。)

- [ ] **Step 2: tsc** — clean。
- [ ] **Step 3: 提交**
```bash
git add app/actions/generate-brief.ts
git commit -m "feat: generateBriefAction runs x-search verification after analysis"
```

---

## Task 7: provider 透传 verification

**Files:** Modify `components/workbench/workflow-provider.tsx`(⚠️ 账号层活跃文件——精确改、只动 generateBrief 块)

- [ ] **Step 1: 把 action 返回的 verification 传进 generateBriefForSignal**

在 `generateBrief` 方法里:`generateBriefAction` 返回成功后,现有 `let ai`;同样取 `verification`。两处调用 `generateBriefForSignal(..., { locale:"zh", now, ai })` 改为 `{ locale:"zh", now, ai, verification }`(从 `result.ok ? result.verification : undefined`)。
```ts
   let ai: AnalyzedBrief | undefined;
   let verification: Verification | undefined;
   // ...
   if (result.ok) { ai = result.analyzed; verification = result.verification; }
   // ...两处 generateBriefForSignal(current/state, signalId, { locale: "zh", now: nowIso(), ai, verification })
```
import `Verification` from `@/lib/domain/types`(若需要)。

- [ ] **Step 2: tsc + build** — `npx tsc --noEmit && npm run build` → clean/通过。
- [ ] **Step 3: 提交**
```bash
git add components/workbench/workflow-provider.tsx
git commit -m "feat: thread x-search verification from action into brief"
```

---

## Task 8: 简报详情 UI 显示核查块

**Files:** Modify 简报详情组件(实现前 `grep -rl "riskNotes\|whyItMatters" components` 定位渲染简报详情的组件;通常 `components/workbench/*brief*` 或 source/detail 面板)

- [ ] **Step 1: 在简报详情里加「事实核查」块**(brief.verification 存在时渲染)

最小实现:status 徽章(文案+颜色按 status)+ `summary` 一句 + `evidence` 列表(每条 `handle` + 可点 `url` 链接,`target="_blank" rel="noreferrer"`)。无 verification 不渲染。用既有简报详情的样式类,新增类名 `brief-verify` 等(无对应 CSS 也能渲染,后续再美化)。

```tsx
{brief.verification ? (
  <section className="brief-verify">
    <span className={`bv-badge bv-${brief.verification.status}`}>{verifyLabel(brief.verification.status)}</span>
    <p className="bv-summary">{brief.verification.summary}</p>
    {brief.verification.evidence.length ? (
      <ul className="bv-evidence">
        {brief.verification.evidence.map((e) => (
          <li key={e.url}>
            <a href={e.url} target="_blank" rel="noreferrer">{e.handle ? `@${e.handle}` : e.url}</a>
            {e.excerpt ? <span className="bv-excerpt"> · {e.excerpt}</span> : null}
          </li>
        ))}
      </ul>
    ) : null}
  </section>
) : null}
```
加一个 `verifyLabel(status)` 小函数(corroborated→「✅ 已获 X 佐证」/disputed→「⚠️ 存疑」/contradicted→「❌ 有矛盾」/unverifiable→「— 未核验」)。

- [ ] **Step 2: tsc + build** — clean/通过。
- [ ] **Step 3: 提交**
```bash
git add <改的组件文件>
git commit -m "feat: show X fact-check block in brief detail"
```

---

## Task 9: 真实 x-search 验证(需 XAI_API_KEY,手动)

**Files:** 无代码改动。

- [ ] **Step 1:** 确认 `.env.local` 含 `XAI_API_KEY`。先 WebFetch xAI Responses API 文档核对 `extractText/extractCitations` 取值是否对(Task 4 占位若不符,修正后重跑单测)。
- [ ] **Step 2:** 起 dev server(preview 工具)→ 工作台对一条真实信号(如 SpaceX)点「生成简报」→ 观察:简报出现「事实核查」块、status 合理、证据帖是可点的真实 X 链接、riskNote 追加正确。
- [ ] **Step 3:** 失败路径:临时改错 `XAI_API_KEY` → 点生成 → 简报照常出、核查块为 `unverifiable`、不报错不阻塞。改回。
- [ ] **Step 4:** 验证通过后,文档标记本特性完成(docs 提交)。

---

## 协调 / 范围
- `workflow-provider.tsx`(Task 7)与简报详情组件(Task 8)是账号层活跃区:精确改、只动相关块;集成 merge 回 main 时若撞,以其版本为基准解。
- 本期内存态、零 DB、不硬限定账号;持久化(editorial_briefs jsonb 列)、抓取管道自动核查、allowed_x_handles 为后续。
- 安全:`XAI_API_KEY` 仅 server 端;错误脱敏不回显 key。
