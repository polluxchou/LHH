# Token 成本追踪 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每次 AI 调用记录 token 用量并按 provider/model 换算成本（USD），落库到 `usage_logs`，供后续成本报表使用。

**Architecture:** 纯函数价格层（`lib/usage/*`：pricing → extract → cost）+ 一张 `usage_logs` 表（每调用一行、单价/成本快照）。provider 库函数（gemini/deepseek）保持返回原有领域对象，新增可选 `onUsage` 回调；usage 在 `defaultDeps`（唯一持有真实 SDK 响应处）被提取，回调携带 `{provider, model, usage}` 上抛，由有 space/user 上下文的调用层（route/action）落库，try/catch 包裹绝不影响主流程。

**Tech Stack:** TypeScript, Next.js 15 (App Router, server actions), Supabase (`@supabase/supabase-js` service-role), OpenAI SDK（DeepSeek 兼容）, `@google/genai`, Vitest。

> **与 spec 的细化差异**：spec 草图把 `extractUsage` 放在调用层；实现中改为在 `defaultDeps`（SDK 边界，唯一能拿到原始响应处）提取，回调 `onUsage` 携带 `{provider, model, usage}`。这样 provider 库函数返回类型不变、调用层只需补 `operation`/`spaceId`/`userId`。`deps.complete`/`deps.generate` 的返回 shape 会扩展加上 `usage` 字段——只影响内部 `defaultDeps` 与注入 deps 的测试（仅 `tests/production/deepseek-script.test.ts`）。

**测试命令：** `npx vitest run <path>` 跑单文件；`npm test` 跑全量。

---

### Task 1: 价格常量 `lib/usage/pricing.ts`

**Files:**
- Create: `lib/usage/pricing.ts`
- Test: `tests/usage/pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/usage/pricing.test.ts
import { describe, it, expect } from "vitest";
import { getModelPrice, PRICING } from "@/lib/usage/pricing";

describe("getModelPrice", () => {
  it("returns real price for an active model", () => {
    const p = getModelPrice("deepseek", "deepseek-v4-flash");
    expect(p).toEqual({ inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.0028, currency: "USD" });
  });

  it("covers all four providers in the table", () => {
    expect(Object.keys(PRICING).sort()).toEqual(["claude", "codex", "deepseek", "gemini"]);
  });

  it("returns null for unknown model", () => {
    expect(getModelPrice("gemini", "made-up-model")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/usage/pricing.test.ts`
Expected: FAIL — cannot find module `@/lib/usage/pricing`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/usage/pricing.ts
export type Provider = "claude" | "gemini" | "codex" | "deepseek";

export interface ModelPrice {
  /** USD / 1M input tokens */
  inputPer1M: number;
  /** USD / 1M output tokens */
  outputPer1M: number;
  /** 可选：缓存命中输入单价 (USD / 1M) */
  cachedInputPer1M?: number;
  currency: "USD";
}

// 2026-06 web search 查得的当前真实定价（来源见 spec）。claude/codex 为未来接入预留，当前无调用方。
export const PRICING: Record<Provider, Record<string, ModelPrice>> = {
  claude: {
    "claude-opus-4-8": { inputPer1M: 5.0, outputPer1M: 25.0, cachedInputPer1M: 0.5, currency: "USD" },
    "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3, currency: "USD" },
  },
  gemini: {
    "gemini-3.5-flash": { inputPer1M: 1.5, outputPer1M: 9.0, cachedInputPer1M: 0.15, currency: "USD" },
  },
  codex: {
    "gpt-5.2-codex": { inputPer1M: 1.75, outputPer1M: 14.0, currency: "USD" },
    "gpt-5.3-codex": { inputPer1M: 1.75, outputPer1M: 14.0, currency: "USD" },
    "codex-mini": { inputPer1M: 0.75, outputPer1M: 3.0, currency: "USD" },
  },
  deepseek: {
    "deepseek-v4-flash": { inputPer1M: 0.14, outputPer1M: 0.28, cachedInputPer1M: 0.0028, currency: "USD" },
  },
};

export function getModelPrice(provider: Provider, model: string): ModelPrice | null {
  return PRICING[provider]?.[model] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usage/pricing.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/usage/pricing.ts tests/usage/pricing.test.ts
git commit -m "feat(usage): provider/model pricing table for token cost"
```

---

### Task 2: 用量归一化 `lib/usage/extract.ts`

**Files:**
- Create: `lib/usage/extract.ts`
- Test: `tests/usage/extract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/usage/extract.test.ts
import { describe, it, expect } from "vitest";
import { extractOpenAIUsage, extractGeminiUsage } from "@/lib/usage/extract";

describe("extractOpenAIUsage", () => {
  it("maps OpenAI/DeepSeek usage shape", () => {
    const res = {
      usage: {
        prompt_tokens: 1200,
        completion_tokens: 300,
        total_tokens: 1500,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    };
    expect(extractOpenAIUsage(res)).toEqual({
      promptTokens: 1200,
      completionTokens: 300,
      totalTokens: 1500,
      cachedInputTokens: 200,
    });
  });

  it("returns null when usage missing", () => {
    expect(extractOpenAIUsage({})).toBeNull();
  });
});

describe("extractGeminiUsage", () => {
  it("maps Gemini usageMetadata shape", () => {
    const res = {
      usageMetadata: {
        promptTokenCount: 800,
        candidatesTokenCount: 150,
        totalTokenCount: 950,
        cachedContentTokenCount: 100,
      },
    };
    expect(extractGeminiUsage(res)).toEqual({
      promptTokens: 800,
      completionTokens: 150,
      totalTokens: 950,
      cachedInputTokens: 100,
    });
  });

  it("returns null when usageMetadata missing", () => {
    expect(extractGeminiUsage({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/usage/extract.test.ts`
Expected: FAIL — cannot find module `@/lib/usage/extract`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/usage/extract.ts
import type { Provider } from "@/lib/usage/pricing";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 可选：输入中命中缓存的部分（promptTokens 的子集） */
  cachedInputTokens?: number;
}

export interface UsageEvent {
  provider: Provider;
  model: string;
  usage: TokenUsage | null;
}

export type UsageSink = (event: UsageEvent) => void;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** OpenAI / DeepSeek（chat.completions）响应的 usage 归一化。 */
export function extractOpenAIUsage(res: unknown): TokenUsage | null {
  const u = (res as { usage?: Record<string, unknown> })?.usage;
  if (!u) return null;
  const cached = (u.prompt_tokens_details as { cached_tokens?: unknown } | undefined)?.cached_tokens;
  const out: TokenUsage = {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens),
  };
  if (typeof cached === "number") out.cachedInputTokens = cached;
  return out;
}

/** @google/genai generateContent 响应的 usageMetadata 归一化。 */
export function extractGeminiUsage(res: unknown): TokenUsage | null {
  const u = (res as { usageMetadata?: Record<string, unknown> })?.usageMetadata;
  if (!u) return null;
  const cached = u.cachedContentTokenCount;
  const out: TokenUsage = {
    promptTokens: num(u.promptTokenCount),
    completionTokens: num(u.candidatesTokenCount),
    totalTokens: num(u.totalTokenCount),
  };
  if (typeof cached === "number") out.cachedInputTokens = cached;
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usage/extract.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/usage/extract.ts tests/usage/extract.test.ts
git commit -m "feat(usage): normalize OpenAI/Gemini token usage shapes"
```

---

### Task 3: 成本计算 `lib/usage/cost.ts`

**Files:**
- Create: `lib/usage/cost.ts`
- Test: `tests/usage/cost.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/usage/cost.test.ts
import { describe, it, expect } from "vitest";
import { computeCost } from "@/lib/usage/cost";

describe("computeCost", () => {
  it("computes standard cost (no cache)", () => {
    // deepseek-v4-flash: 0.14 / 0.28 per 1M
    const r = computeCost("deepseek", "deepseek-v4-flash", {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
    });
    expect(r).not.toBeNull();
    expect(r!.inputPricePer1M).toBe(0.14);
    expect(r!.outputPricePer1M).toBe(0.28);
    expect(r!.costUsd).toBeCloseTo(0.42, 10); // 0.14 + 0.28
    expect(r!.currency).toBe("USD");
  });

  it("applies cached input rate to the cached portion", () => {
    // 1M prompt of which 1M cached → all input at 0.0028, 0 output
    const r = computeCost("deepseek", "deepseek-v4-flash", {
      promptTokens: 1_000_000,
      completionTokens: 0,
      totalTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
    });
    expect(r!.costUsd).toBeCloseTo(0.0028, 10);
  });

  it("returns null for unknown model (caller still keeps token counts)", () => {
    expect(computeCost("gemini", "nope", { promptTokens: 10, completionTokens: 5, totalTokens: 15 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/usage/cost.test.ts`
Expected: FAIL — cannot find module `@/lib/usage/cost`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/usage/cost.ts
import { getModelPrice, type Provider } from "@/lib/usage/pricing";
import type { TokenUsage } from "@/lib/usage/extract";

export interface CostResult {
  inputPricePer1M: number;
  outputPricePer1M: number;
  costUsd: number;
  currency: "USD";
}

export function computeCost(provider: Provider, model: string, usage: TokenUsage): CostResult | null {
  const price = getModelPrice(provider, model);
  if (!price) {
    console.warn(`computeCost: no price for ${provider}/${model}; keeping token counts, cost=null`);
    return null;
  }
  const cached = usage.cachedInputTokens ?? 0;
  const uncachedInput = Math.max(0, usage.promptTokens - cached);
  const cachedRate = price.cachedInputPer1M ?? price.inputPer1M;
  const costUsd =
    (uncachedInput / 1e6) * price.inputPer1M +
    (cached / 1e6) * cachedRate +
    (usage.completionTokens / 1e6) * price.outputPer1M;
  return {
    inputPricePer1M: price.inputPer1M,
    outputPricePer1M: price.outputPer1M,
    costUsd,
    currency: "USD",
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usage/cost.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/usage/cost.ts tests/usage/cost.test.ts
git commit -m "feat(usage): compute per-call cost with cached-token handling"
```

---

### Task 4: 数据库迁移 `usage_logs`

**Files:**
- Create: `supabase/migrations/0010_usage_logs.sql`

> 无单测（纯 SQL）。沿用 0003/0008 既有约定：启用 RLS、仅 `is_space_member/is_space_owner` 的 SELECT 策略、写入走 service-role 绕过 RLS。`space_id`/`user_id` 可空（ingest 为系统任务、交互动作暂不带 space/user）。

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0010_usage_logs.sql — 每次 AI 调用的 token 用量与成本快照
-- 新增式、非破坏性。写入走 service-role（绕过 RLS）；读策略与 0003/0008 一致。

create table if not exists public.usage_logs (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces (id) on delete set null,
  user_id  uuid references auth.users (id)   on delete set null,
  provider text not null check (provider in ('claude','gemini','codex','deepseek')),
  model text not null,
  operation text not null check (operation in ('ingest_search','ingest_analyze','article','production')),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cached_input_tokens integer,
  input_price_per_1m numeric,   -- 调用时单价快照
  output_price_per_1m numeric,
  cost_usd numeric,             -- 计算结果快照；未知价格为 null
  currency text not null default 'USD',
  status text not null default 'success' check (status in ('success','error')),
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_space_created_idx on public.usage_logs (space_id, created_at desc);
create index if not exists usage_logs_provider_model_idx on public.usage_logs (provider, model);

alter table public.usage_logs enable row level security;

-- 仅 SELECT 策略，复用 0002 的 security-definer helper（space_id 可空，需先判非空）
drop policy if exists usage_logs_space_read on public.usage_logs;
create policy usage_logs_space_read on public.usage_logs
  for select using (
    space_id is not null and (is_space_member(space_id) or is_space_owner(space_id))
  );
```

- [ ] **Step 2: Review + apply**

按项目常规迁移流程 apply（与 0008/0009 同样方式）。⚠️ 不要自动 apply 到生产共享库——交由你确认后执行。apply 后用 SQL 客户端确认表与策略存在：
Run（确认表已建）: `psql "$DATABASE_URL" -c "\d+ public.usage_logs"`（或在 Supabase SQL editor 查 `select * from public.usage_logs limit 1;`）
Expected: 表存在、列与上面一致、RLS enabled。

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0010_usage_logs.sql
git commit -m "feat(usage): usage_logs migration (per-call token cost snapshot)"
```

---

### Task 5: 落库辅助 `lib/usage/record.ts`

**Files:**
- Create: `lib/usage/record.ts`
- Test: `tests/usage/record.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/usage/record.test.ts
import { describe, it, expect, vi } from "vitest";
import { recordUsage } from "@/lib/usage/record";

describe("recordUsage", () => {
  it("inserts a row with price + cost snapshot", async () => {
    const rows: Record<string, unknown>[] = [];
    await recordUsage(
      {
        provider: "deepseek",
        model: "deepseek-v4-flash",
        operation: "article",
        usage: { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
        spaceId: "space-1",
      },
      { insert: async (row) => { rows.push(row); } },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      space_id: "space-1",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      operation: "article",
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
      input_price_per_1m: 0.14,
      output_price_per_1m: 0.28,
      status: "success",
    });
    expect(rows[0].cost_usd).toBeCloseTo(0.42, 10);
  });

  it("no-ops when usage is null", async () => {
    const insert = vi.fn();
    await recordUsage(
      { provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", usage: null },
      { insert },
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("swallows insert errors (never throws into the caller flow)", async () => {
    await expect(
      recordUsage(
        { provider: "deepseek", model: "deepseek-v4-flash", operation: "production", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        { insert: async () => { throw new Error("db down"); } },
      ),
    ).resolves.toBeUndefined();
  });

  it("stores null cost for unknown model but keeps token counts", async () => {
    const rows: Record<string, unknown>[] = [];
    await recordUsage(
      { provider: "gemini", model: "ghost-model", operation: "ingest_search", usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
      { insert: async (row) => { rows.push(row); } },
    );
    expect(rows[0]).toMatchObject({ cost_usd: null, prompt_tokens: 10, total_tokens: 15 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/usage/record.test.ts`
Expected: FAIL — cannot find module `@/lib/usage/record`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/usage/record.ts
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeCost } from "@/lib/usage/cost";
import type { Provider } from "@/lib/usage/pricing";
import type { TokenUsage } from "@/lib/usage/extract";

export type UsageOperation = "ingest_search" | "ingest_analyze" | "article" | "production";

export interface RecordUsageInput {
  provider: Provider;
  model: string;
  operation: UsageOperation;
  usage: TokenUsage | null;
  spaceId?: string | null;
  userId?: string | null;
  status?: "success" | "error";
}

export interface RecordUsageDeps {
  insert: (row: Record<string, unknown>) => Promise<void>;
}

function defaultDeps(): RecordUsageDeps {
  return {
    insert: async (row) => {
      const db = createSupabaseAdminClient();
      const { error } = await db.from("usage_logs").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}

/** 落一行用量记录。整体 try/catch：记录失败仅告警，绝不影响用户生成主流程。 */
export async function recordUsage(input: RecordUsageInput, deps: RecordUsageDeps = defaultDeps()): Promise<void> {
  try {
    if (!input.usage) return; // 无 usage（SDK 未返回）则跳过
    const cost = computeCost(input.provider, input.model, input.usage);
    await deps.insert({
      space_id: input.spaceId ?? null,
      user_id: input.userId ?? null,
      provider: input.provider,
      model: input.model,
      operation: input.operation,
      prompt_tokens: input.usage.promptTokens,
      completion_tokens: input.usage.completionTokens,
      total_tokens: input.usage.totalTokens,
      cached_input_tokens: input.usage.cachedInputTokens ?? null,
      input_price_per_1m: cost?.inputPricePer1M ?? null,
      output_price_per_1m: cost?.outputPricePer1M ?? null,
      cost_usd: cost?.costUsd ?? null,
      currency: "USD",
      status: input.status ?? "success",
    });
  } catch (e) {
    console.warn("recordUsage failed (ignored):", (e as Error).message);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usage/record.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/usage/record.ts tests/usage/record.test.ts
git commit -m "feat(usage): recordUsage writes per-call cost snapshot to usage_logs"
```

---

### Task 6: 接入 Gemini 搜索（`lib/ingest/gemini-search.ts`）

**Files:**
- Modify: `lib/ingest/gemini-search.ts:116-145`
- Test: `tests/ingest/gemini-search.test.ts`（新增 onUsage 用例）

- [ ] **Step 1: Write the failing test**

在 `tests/ingest/gemini-search.test.ts` 顶部 import 改为加入 `searchRecentNews`，文件末尾追加：

```ts
import { searchRecentNews } from "@/lib/ingest/gemini-search";

describe("searchRecentNews onUsage", () => {
  it("forwards normalized usage with gemini provider+model", async () => {
    const events: unknown[] = [];
    const items = await searchRecentNews(
      { brand: "SpaceX", sinceDate: "2026-06-08", todayDate: "2026-06-15" },
      (e) => events.push(e),
      {
        generate: async () => ({
          text: '[{"title":"T","url":"https://x.com/a","publishedDate":"2026-06-14","summary":"s"}]',
          groundingChunks: [],
          usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
        }),
      },
    );
    expect(items).toHaveLength(1);
    expect(events).toEqual([
      { provider: "gemini", model: "gemini-3.5-flash", usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest/gemini-search.test.ts`
Expected: FAIL — `searchRecentNews` 不接受 onUsage 参数 / `SearchDeps.generate` 返回类型不含 `usage`（类型错误或运行时 events 为空）。

- [ ] **Step 3: Write minimal implementation**

改 `lib/ingest/gemini-search.ts`：先加 import，再替换 `SearchDeps`/`defaultDeps`/`searchRecentNews`：

```ts
// 文件顶部 import 区追加：
import { extractGeminiUsage, type TokenUsage, type UsageSink } from "@/lib/usage/extract";
```

```ts
export interface SearchDeps {
  generate: (
    prompt: string,
  ) => Promise<{ text: string; groundingChunks: GroundingChunk[]; usage: TokenUsage | null }>;
}

function defaultDeps(): SearchDeps {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return {
    generate: async (prompt) => {
      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });
      const chunks =
        res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      return {
        text: res.text ?? "",
        groundingChunks: chunks as GroundingChunk[],
        usage: extractGeminiUsage(res),
      };
    },
  };
}

export async function searchRecentNews(
  opts: { brand: string; sinceDate: string; todayDate: string; keywords?: string[]; excludedTerms?: string[] },
  onUsage?: UsageSink,
  deps: SearchDeps = defaultDeps(),
): Promise<GeminiNewsItem[]> {
  const prompt = buildSearchPrompt(opts.brand, opts.sinceDate, opts.todayDate, opts.keywords ?? [], opts.excludedTerms ?? []);
  const { text, groundingChunks, usage } = await deps.generate(prompt);
  onUsage?.({ provider: "gemini", model: "gemini-3.5-flash", usage });
  return parseGeminiResponse(text, groundingChunks);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest/gemini-search.test.ts`
Expected: PASS（含新 onUsage 用例 + 原有用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/gemini-search.ts tests/ingest/gemini-search.test.ts
git commit -m "feat(usage): emit token usage from gemini search"
```

---

### Task 7: 接入 DeepSeek 分析（`lib/ingest/deepseek-analyze.ts`）

**Files:**
- Modify: `lib/ingest/deepseek-analyze.ts:85-114`
- Test: `tests/ingest/deepseek-analyze.test.ts`（新增 onUsage 用例）

- [ ] **Step 1: Write the failing test**

在 `tests/ingest/deepseek-analyze.test.ts` 顶部 import 追加 `analyzeBrief`，文件末尾追加：

```ts
import { analyzeBrief } from "@/lib/ingest/deepseek-analyze";

describe("analyzeBrief onUsage", () => {
  const validJson = JSON.stringify({
    signalType: "technical_project_milestone",
    headline: "h", summary: "s", eventDate: "2026-06-14", confidence: 0.8,
    briefTitle: "bt", factSummary: "fs", whyItMatters: "w",
    possibleAngles: ["a"], openQuestions: ["q"], riskNotes: ["r"],
    score: { freshnessScore: 5, importanceScore: 4, rarityScore: 3, audienceInterestScore: 4, visualPotentialScore: 5, riskScore: 2, overallRecommendation: "strong", scoringNotes: "n" },
  });

  it("forwards usage with deepseek provider+model", async () => {
    const events: unknown[] = [];
    const a = await analyzeBrief(
      { brand: "SpaceX", items: [{ title: "t", url: "u", publishedDate: "2026-06-14", summary: "s" }] },
      (e) => events.push(e),
      { complete: async () => ({ text: validJson, usage: { promptTokens: 500, completionTokens: 120, totalTokens: 620 } }) },
    );
    expect(a?.headline).toBe("h");
    expect(events).toEqual([
      { provider: "deepseek", model: "deepseek-v4-flash", usage: { promptTokens: 500, completionTokens: 120, totalTokens: 620 } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ingest/deepseek-analyze.test.ts`
Expected: FAIL — `analyzeBrief` 不接受 onUsage / `complete` 返回类型不含 usage。

- [ ] **Step 3: Write minimal implementation**

改 `lib/ingest/deepseek-analyze.ts`：

```ts
// 文件顶部 import 区追加：
import { extractOpenAIUsage, type TokenUsage, type UsageSink } from "@/lib/usage/extract";
```

```ts
export interface AnalyzeDeps {
  complete: (prompt: string) => Promise<{ text: string; usage: TokenUsage | null }>;
}

function defaultDeps(): AnalyzeDeps {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  return {
    complete: async (prompt) => {
      const res = await client.chat.completions.create({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      return { text: res.choices[0]?.message?.content ?? "", usage: extractOpenAIUsage(res) };
    },
  };
}

export async function analyzeBrief(
  opts: { brand: string; items: GeminiNewsItem[] },
  onUsage?: UsageSink,
  deps: AnalyzeDeps = defaultDeps(),
): Promise<AnalyzedBrief | null> {
  if (opts.items.length === 0) return null;
  const { text, usage } = await deps.complete(buildAnalyzePrompt(opts.brand, opts.items));
  onUsage?.({ provider: "deepseek", model: "deepseek-v4-flash", usage });
  return parseAnalysis(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ingest/deepseek-analyze.test.ts`
Expected: PASS（新用例 + 原有 buildAnalyzePrompt/parseAnalysis 用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/deepseek-analyze.ts tests/ingest/deepseek-analyze.test.ts
git commit -m "feat(usage): emit token usage from deepseek analysis"
```

---

### Task 8: 接入 DeepSeek 文章（`lib/article/deepseek-article.ts`）

**Files:**
- Modify: `lib/article/deepseek-article.ts:87-125`
- Test: `tests/article/deepseek-article.test.ts`（新增 onUsage 用例）

- [ ] **Step 1: Write the failing test**

在 `tests/article/deepseek-article.test.ts` 末尾追加：

```ts
import { generateArticle } from "@/lib/article/deepseek-article";

describe("generateArticle onUsage", () => {
  it("forwards usage with deepseek provider+model", async () => {
    const events: unknown[] = [];
    const out = await generateArticle(
      { brief, topicCard: null, type: "short", platform: "xiaohongshu", audience: "新手妈妈" },
      (e) => events.push(e),
      { complete: async () => ({ text: '{"sections":[{"id":"lead","label":"导语","body":"正文"}]}', usage: { promptTokens: 300, completionTokens: 80, totalTokens: 380 } }) },
    );
    expect(out).toEqual([{ id: "lead", label: "导语", body: "正文" }]);
    expect(events).toEqual([
      { provider: "deepseek", model: "deepseek-v4-flash", usage: { promptTokens: 300, completionTokens: 80, totalTokens: 380 } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/article/deepseek-article.test.ts`
Expected: FAIL — `generateArticle` 不接受 onUsage / `complete` 返回类型不含 usage。

- [ ] **Step 3: Write minimal implementation**

改 `lib/article/deepseek-article.ts`（三个公开函数都加 onUsage；模型字符串 `deepseek-v4-flash`）：

```ts
// 文件顶部 import 区追加：
import { extractOpenAIUsage, type TokenUsage, type UsageSink } from "@/lib/usage/extract";

const ARTICLE_MODEL = "deepseek-v4-flash";
```

```ts
export interface ArticleDeps {
  complete: (prompt: string) => Promise<{ text: string; usage: TokenUsage | null }>;
}

function defaultDeps(): ArticleDeps {
  const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
  return {
    complete: async (prompt) => {
      const res = await client.chat.completions.create({
        model: ARTICLE_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      });
      return { text: res.choices[0]?.message?.content ?? "", usage: extractOpenAIUsage(res) };
    },
  };
}

export async function generateArticle(a: GenArgs, onUsage?: UsageSink, deps: ArticleDeps = defaultDeps()): Promise<ArticleSection[] | null> {
  const { text, usage } = await deps.complete(buildArticlePrompt(a));
  onUsage?.({ provider: "deepseek", model: ARTICLE_MODEL, usage });
  return parseSections(text);
}

export async function regenerateSection(
  a: GenArgs,
  section: ArticleSection,
  onUsage?: UsageSink,
  deps: ArticleDeps = defaultDeps(),
): Promise<string | null> {
  const { text, usage } = await deps.complete(buildSectionRegenPrompt(a, section));
  onUsage?.({ provider: "deepseek", model: ARTICLE_MODEL, usage });
  const secs = parseSections(text);
  return secs?.find((s) => s.id === section.id)?.body ?? secs?.[0]?.body ?? null;
}

export async function translateSections(
  sections: ArticleSection[],
  lang: ArticleLang,
  onUsage?: UsageSink,
  deps: ArticleDeps = defaultDeps(),
): Promise<ArticleSection[] | null> {
  const { text, usage } = await deps.complete(buildTranslatePrompt(sections, lang));
  onUsage?.({ provider: "deepseek", model: ARTICLE_MODEL, usage });
  return parseSections(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/article/deepseek-article.test.ts`
Expected: PASS（新用例 + 原有用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/article/deepseek-article.ts tests/article/deepseek-article.test.ts
git commit -m "feat(usage): emit token usage from deepseek article generation"
```

---

### Task 9: 接入 DeepSeek 生产脚本（`lib/production/deepseek-script.ts`）

**Files:**
- Modify: `lib/production/deepseek-script.ts:121-163`
- Modify: `tests/production/deepseek-script.test.ts`（更新所有注入 `complete` 的 mock：返回 `{ text, usage }`）

> 此文件的测试**注入了 `deps.complete`**（返回 string），故必须随返回类型改动一并更新。generateProduction 最多调用 2 次（重试），每次都触发 onUsage（两次 API 调用 = 两条成本记录，符合实际计费）。

- [ ] **Step 1: Update existing mocks + add onUsage test**

在 `tests/production/deepseek-script.test.ts` 中，把每处 `complete` mock 的返回从 string 改成 `{ text, usage: null }`：

第 86 行：
```ts
    const pkg = await generateProduction({ brief, topicCard: card }, undefined, { complete: async () => ({ text: okJson, usage: null }) });
```
第 96 行：
```ts
    await expect(generateProduction({ brief, topicCard: card }, undefined, { complete: async () => ({ text: "garbage", usage: null }) })).rejects.toThrow();
```
第 105 行：
```ts
    const complete = async () => { calls += 1; return calls === 1 ? { text: "garbage", usage: null } : { text: okJson2, usage: null }; };
```
第 106 行：
```ts
    const pkg = await generateProduction({ brief, topicCard: card }, undefined, { complete });
```
第 113 行：
```ts
    const complete = async () => { calls += 1; return { text: "garbage", usage: null }; };
```
第 114 行：
```ts
    await expect(generateProduction({ brief, topicCard: card }, undefined, { complete })).rejects.toThrow();
```
第 120-121 行：
```ts
    const complete = async () => { calls += 1; return { text: okJson2, usage: null }; };
    await generateProduction({ brief, topicCard: card }, undefined, { complete });
```
第 137-139 行：
```ts
    const pkg = await generateProduction(
      { brief, topicCard: card, targetDuration: "9 min" },
      undefined,
      { complete: async () => ({ text: okJson3, usage: null }) },
    );
```
第 144-147 行：
```ts
    const pkg = await generateProduction(
      { brief, topicCard: card },
      undefined,
      { complete: async () => ({ text: okJson3, usage: null }) },
    );
```

并在文件末尾追加 onUsage 用例：
```ts
describe("generateProduction onUsage", () => {
  const okJson4 = JSON.stringify({ sections: goodSections, storyboard: goodShots });
  it("forwards usage per completion call", async () => {
    const events: unknown[] = [];
    await generateProduction(
      { brief, topicCard: card },
      (e) => events.push(e),
      { complete: async () => ({ text: okJson4, usage: { promptTokens: 700, completionTokens: 900, totalTokens: 1600 } }) },
    );
    expect(events).toEqual([
      { provider: "deepseek", model: "deepseek-v4-flash", usage: { promptTokens: 700, completionTokens: 900, totalTokens: 1600 } },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: FAIL — `generateProduction` 签名尚未加 onUsage / `complete` 返回类型不匹配。

- [ ] **Step 3: Write minimal implementation**

改 `lib/production/deepseek-script.ts`：

```ts
// 文件顶部 import 区追加：
import { extractOpenAIUsage, type TokenUsage, type UsageSink } from "@/lib/usage/extract";

const SCRIPT_MODEL = "deepseek-v4-flash";
```

```ts
export interface GenerateDeps {
  complete: (prompt: string) => Promise<{ text: string; usage: TokenUsage | null }>;
}

function defaultDeps(): GenerateDeps {
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: "https://api.deepseek.com",
  });
  return {
    complete: async (prompt) => {
      const res = await client.chat.completions.create({
        model: SCRIPT_MODEL,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        // 长视频(12-15 min)需 4 段脚本 + ~10-13 个分镜的完整 JSON;留足上限避免截断导致 JSON 解析失败。
        max_tokens: 8000,
      });
      return { text: res.choices[0]?.message?.content ?? "", usage: extractOpenAIUsage(res) };
    },
  };
}

export async function generateProduction(
  opts: { brief: EditorialBrief; topicCard?: TopicCard | null; targetDuration?: string },
  onUsage?: UsageSink,
  deps: GenerateDeps = defaultDeps(),
): Promise<ProductionPackage> {
  const topicCard = opts.topicCard ?? null;
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  // 用户在工作室选定的时长优先;否则回退到选题卡 formatLabel 推导。
  const targetDuration = opts.targetDuration?.trim() || deriveTargetDuration(formatLabel);
  const prompt = buildScriptPrompt(opts.brief, topicCard, targetDuration);

  const runOnce = async (): Promise<{ sections: ScriptSection[]; storyboard: StoryboardShot[] } | null> => {
    const { text, usage } = await deps.complete(prompt);
    onUsage?.({ provider: "deepseek", model: SCRIPT_MODEL, usage });
    return parseProduction(text);
  };

  // 真实模型偶发输出不达标(已实测);重试一次(temperature>0,重试通常不同)再放弃。
  let parsed = await runOnce();
  if (!parsed) parsed = await runOnce();
  if (!parsed) throw new Error("DeepSeek 生产包解析失败");
  const wordCount = parsed.sections.reduce((sum, s) => sum + s.body.length, 0);
  return {
    script: { targetDuration, wordCount, sections: parsed.sections },
    storyboard: parsed.storyboard,
    task: buildTaskScaffold(opts.brief, topicCard),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: PASS（更新后的 mock + 新 onUsage 用例 + 重试计数用例全绿）。

- [ ] **Step 5: Commit**

```bash
git add lib/production/deepseek-script.ts tests/production/deepseek-script.test.ts
git commit -m "feat(usage): emit token usage from deepseek production script"
```

---

### Task 10: 在调用层落库（route + actions）

**Files:**
- Modify: `app/api/ingest/route.ts:51-67`
- Modify: `lib/ingest/run.ts:42-44`
- Modify: `app/actions/generate-brief.ts:36`
- Modify: `app/actions/generate-article.ts:22-64`
- Modify: `app/actions/generate-production.ts:18-22`

> 无新单测：这些是把 `recordUsage` 接到真实调用点的 glue（其逻辑已在 Task 5 全覆盖）。验证靠类型检查 + 全量测试不回归。两条 ingest 路径（cron route 与 `ingestTrackingObject` 按需抓取）都有 `space_id`（系统任务，user 为 null）；交互动作暂不带 space/user（记 null，后续可扩展从 action input 透传）。

- [ ] **Step 1: Wire ingest route**

`app/api/ingest/route.ts` 顶部 import 追加：
```ts
import { recordUsage } from "@/lib/usage/record";
```
把 51-67 行的 `runIngestForBrand(...)` 调用中的 `search`/`analyze` 闭包改为带 onUsage：
```ts
      const result = await runIngestForBrand(
        {
          id: b.id, spaceId: b.space_id, name: b.name, aliases: b.aliases ?? [],
          keywords: b.keywords ?? [], excludedTerms: b.excluded_terms ?? [],
          languages: b.languages ?? [], regions: b.regions ?? [],
        },
        {
          now,
          windowDays: 7,
          seenCanonicalUrls,
          search: (brand, since, today, keywords, excludedTerms) =>
            searchRecentNews(
              { brand, sinceDate: since, todayDate: today, keywords, excludedTerms },
              (e) => void recordUsage({ ...e, operation: "ingest_search", spaceId: b.space_id }),
            ),
          analyze: (brand, items) =>
            analyzeBrief(
              { brand, items },
              (e) => void recordUsage({ ...e, operation: "ingest_analyze", spaceId: b.space_id }),
            ),
        },
      );
```

- [ ] **Step 1b: Wire on-demand ingest (`lib/ingest/run.ts`)**

`lib/ingest/run.ts` 顶部 import 追加：
```ts
import { recordUsage } from "@/lib/usage/record";
```
把 42-44 行的 `search`/`analyze` 闭包改为带 onUsage（`brand.spaceId` 可用）：
```ts
    search: (b, since, today, keywords, excludedTerms) =>
      searchRecentNews(
        { brand: b, sinceDate: since, todayDate: today, keywords, excludedTerms },
        (e) => void recordUsage({ ...e, operation: "ingest_search", spaceId: brand.spaceId }),
      ),
    analyze: (b, items) =>
      analyzeBrief(
        { brand: b, items },
        (e) => void recordUsage({ ...e, operation: "ingest_analyze", spaceId: brand.spaceId }),
      ),
```

- [ ] **Step 2: Wire generate-brief action**

`app/actions/generate-brief.ts` 顶部 import 追加：
```ts
import { recordUsage } from "@/lib/usage/record";
```
把第 36 行改为：
```ts
    const analyzed = await analyzeBrief(
      { brand: input.brand, items },
      (e) => void recordUsage({ ...e, operation: "ingest_analyze" }),
    );
```

- [ ] **Step 3: Wire generate-article action**

`app/actions/generate-article.ts` 顶部 import 追加：
```ts
import { recordUsage } from "@/lib/usage/record";
```
三处调用加 onUsage（`generateArticle` 第 24 行、`regenerateSection` 第 35 行、两处 `translateSections` 第 47 与 59 行）：
```ts
    const v = await generateArticle(input, (e) => void recordUsage({ ...e, operation: "article" }));
```
```ts
    const v = await regenerateSection(input, input.section, (e) => void recordUsage({ ...e, operation: "article" }));
```
```ts
    const v = await translateSections(input.sections, input.lang, (e) => void recordUsage({ ...e, operation: "article" }));
```
```ts
    const v = await translateSections([input.section], input.lang, (e) => void recordUsage({ ...e, operation: "article" }));
```

- [ ] **Step 4: Wire generate-production action**

`app/actions/generate-production.ts` 顶部 import 追加：
```ts
import { recordUsage } from "@/lib/usage/record";
```
把 18-22 行的调用改为：
```ts
    const pkg = await generateProduction(
      {
        brief: input.brief,
        topicCard: input.topicCard,
        targetDuration: input.targetDuration,
      },
      (e) => void recordUsage({ ...e, operation: "production" }),
    );
```

- [ ] **Step 5: Typecheck + full test run (no regression)**

Run: `npx tsc --noEmit && npm test`
Expected: tsc 0 错误；全量测试全绿。

- [ ] **Step 6: Commit**

```bash
git add app/api/ingest/route.ts lib/ingest/run.ts app/actions/generate-brief.ts app/actions/generate-article.ts app/actions/generate-production.ts
git commit -m "feat(usage): record token cost at ingest paths and generation actions"
```

---

### Task 11: 聚合查询辅助 `lib/usage/aggregate.ts`（占位）

**Files:**
- Create: `lib/usage/aggregate.ts`
- Test: `tests/usage/aggregate.test.ts`

> 本轮只做纯聚合函数（按 provider/model/operation/day 分组、求和 tokens 与 cost），供后续报表 UI 直接用。读库放在后续 UI spec。

- [ ] **Step 1: Write the failing test**

```ts
// tests/usage/aggregate.test.ts
import { describe, it, expect } from "vitest";
import { aggregateRows, type UsageRow } from "@/lib/usage/aggregate";

const rows: UsageRow[] = [
  { provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 100, cost_usd: 0.01, created_at: "2026-06-16T01:00:00Z" },
  { provider: "deepseek", model: "deepseek-v4-flash", operation: "article", total_tokens: 200, cost_usd: 0.02, created_at: "2026-06-16T05:00:00Z" },
  { provider: "gemini", model: "gemini-3.5-flash", operation: "ingest_search", total_tokens: 50, cost_usd: null, created_at: "2026-06-16T02:00:00Z" },
];

describe("aggregateRows", () => {
  it("groups by provider and sums tokens + cost (null cost treated as 0)", () => {
    const out = aggregateRows(rows, ["provider"]);
    const ds = out.find((g) => g.key.provider === "deepseek");
    expect(ds).toMatchObject({ totalTokens: 300, totalCostUsd: 0.03, calls: 2 });
    const gm = out.find((g) => g.key.provider === "gemini");
    expect(gm).toMatchObject({ totalTokens: 50, totalCostUsd: 0, calls: 1 });
  });

  it("groups by provider + day", () => {
    const out = aggregateRows(rows, ["provider", "day"]);
    const ds = out.find((g) => g.key.provider === "deepseek" && g.key.day === "2026-06-16");
    expect(ds?.calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/usage/aggregate.test.ts`
Expected: FAIL — cannot find module `@/lib/usage/aggregate`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/usage/aggregate.ts
import type { Provider } from "@/lib/usage/pricing";
import type { UsageOperation } from "@/lib/usage/record";

export interface UsageRow {
  provider: Provider;
  model: string;
  operation: UsageOperation;
  total_tokens: number;
  cost_usd: number | null;
  created_at: string;
}

export type GroupDim = "provider" | "model" | "operation" | "day";

export interface UsageGroup {
  key: Partial<Record<GroupDim, string>>;
  totalTokens: number;
  totalCostUsd: number;
  calls: number;
}

function dimValue(row: UsageRow, dim: GroupDim): string {
  if (dim === "day") return row.created_at.slice(0, 10);
  return String(row[dim]);
}

/** 纯聚合：对已取出的行按维度分组求和。读库由后续报表 UI 负责。 */
export function aggregateRows(rows: UsageRow[], groupBy: GroupDim[]): UsageGroup[] {
  const map = new Map<string, UsageGroup>();
  for (const row of rows) {
    const key: Partial<Record<GroupDim, string>> = {};
    for (const dim of groupBy) key[dim] = dimValue(row, dim);
    const id = groupBy.map((d) => key[d]).join("|");
    let g = map.get(id);
    if (!g) {
      g = { key, totalTokens: 0, totalCostUsd: 0, calls: 0 };
      map.set(id, g);
    }
    g.totalTokens += row.total_tokens;
    g.totalCostUsd += row.cost_usd ?? 0;
    g.calls += 1;
  }
  return [...map.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/usage/aggregate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/usage/aggregate.ts tests/usage/aggregate.test.ts
git commit -m "feat(usage): pure usage aggregation helper for reporting"
```

---

## 完成校验

- [ ] 全量测试绿：`npm test`
- [ ] 类型检查零错误：`npx tsc --noEmit`
- [ ] Lint：`npm run lint`
- [ ] `usage_logs` 迁移已按常规流程 apply（确认后执行，勿擅自动生产库）。

## 实现顺序与依赖

Task 1 → 2 → 3 为价格层（先做），互相依赖（2 import 1，3 import 1+2）。Task 4（迁移）与 5（record）依赖 1-3。Task 6-9（接入 provider）依赖 2。Task 10（落库 glue）依赖 5-9。Task 11（聚合）依赖 1 与 5 的类型。
