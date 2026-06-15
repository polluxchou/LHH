# LHH 新闻情报接入流水线 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 LHH 里实现一条云端每日运行的新闻情报流水线：Gemini grounding 按品牌搜近期新闻 → 代码侧新鲜度过滤+去重 → DeepSeek 结构化分析成简报 → 写入 Supabase，由 Vercel Cron 每日触发。

**Architecture:** 全部 Next.js/TS。纯逻辑（新鲜度过滤、流水线编排）用注入式客户端，可在无 API key 下用 vitest 跑单测；LLM 客户端与 Supabase 写入是集成层，运行需 key。本计划只做 Layer 2（接入）+ Layer 3（调度）+ 写库；**Layer 1（工作台改读 Supabase）另立计划**（见末尾「后续」）。

**Tech Stack:** Next.js 15 App Router、TypeScript、vitest、`@google/genai`（Gemini grounding）、`openai`（指向 DeepSeek）、`@supabase/supabase-js`。

**前置（执行前用户须提供）：**
- `GEMINI_API_KEY`、`DEEPSEEK_API_KEY`、`INGEST_SECRET`（任意强随机串）
- Supabase 项目：应用 `supabase/migrations/0001_initial_schema.sql`，提供 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`
- `tracking_objects` 表里有至少 1 条监控品牌（可先手动插 1 条测试）

单测全程用 mock，不需要上述 key；只有 Task 8 的本地实跑与 Task 9 的部署需要。

参考 spec：`docs/superpowers/specs/2026-06-14-lhh-news-ingestion-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `lib/ingest/types.ts` | 流水线中间类型（GeminiNewsItem、IngestResult 等，避开 fixtures 的字符串 id↔UUID 阻抗） |
| `lib/ingest/freshness.ts` | 纯函数：按发布日期窗口过滤 |
| `lib/ingest/gemini-search.ts` | 调 Gemini grounding 搜近期新闻，解析条目 + 出处 URL（客户端可注入） |
| `lib/ingest/deepseek-analyze.ts` | 调 DeepSeek 把条目结构化成 signal/brief/score（客户端可注入） |
| `lib/ingest/pipeline.ts` | 编排：搜索→过滤→去重→分析→组装 IngestResult（注入式，纯可测） |
| `lib/db/supabase.ts` | Supabase 服务端客户端工厂 |
| `lib/db/ingest-writer.ts` | 幂等写入 Supabase（靠 url、(tracking_object_id,dedupe_key) 唯一约束） |
| `app/api/ingest/route.ts` | POST 入口，密钥保护，跑流水线+写库 |
| `vercel.json` | Cron 每日触发 |
| `tests/ingest/*.test.ts`、`tests/db/*.test.ts` | 单测 |

复用现有：`lib/search/dedupe.ts`（canonicalizeUrl / dedupeByCanonicalUrl）、`lib/search/query-builder.ts`（buildTrackingObjectQueries）、`lib/domain/types.ts`。

---

## Task 0：添加依赖与环境样例

**Files:**
- Modify: `package.json`
- Create: `.env.example`

- [ ] **Step 1: 安装依赖**

Run:
```bash
cd /Users/fengzhou/Code/LHH && npm install @google/genai openai @supabase/supabase-js
```
Expected: 三个包写入 `package.json` dependencies，无报错。

- [ ] **Step 2: 写 `.env.example`**

```bash
GEMINI_API_KEY=
DEEPSEEK_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
INGEST_SECRET=
```

- [ ] **Step 3: 确认测试可跑**

Run: `npm test`
Expected: 现有测试通过（或「no test files」之外的现有用例 PASS）。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example && git commit -m "chore: add gemini/deepseek/supabase deps and env example"
```

> 注：当前目录非 git 仓库时，先 `git init` 再提交；若用户不想用 git，跳过所有 commit 步骤。

---

## Task 1：流水线中间类型

**Files:**
- Create: `lib/ingest/types.ts`

- [ ] **Step 1: 写类型**

```typescript
import type {
  CandidateSignalType,
  ContentValueScore,
} from "@/lib/domain/types";

/** Gemini 搜索返回的单条新闻（解析后） */
export interface GeminiNewsItem {
  title: string;
  url: string;
  /** ISO date string (YYYY-MM-DD) or null if unknown */
  publishedDate: string | null;
  summary: string;
}

/** DeepSeek 结构化分析的产出 */
export interface AnalyzedBrief {
  signalType: CandidateSignalType;
  headline: string;
  summary: string;
  /** ISO date (YYYY-MM-DD) or null */
  eventDate: string | null;
  confidence: number; // 0..1
  briefTitle: string;
  factSummary: string;
  whyItMatters: string;
  possibleAngles: string[];
  openQuestions: string[];
  riskNotes: string[];
  score: Omit<ContentValueScore, "editorialBriefId" | "compositeScore">;
}

/** 写库前的一次品牌产出 */
export interface IngestResult {
  trackingObjectId: string;
  querySet: string[];
  freshItems: GeminiNewsItem[];
  analyzed: AnalyzedBrief | null; // 无新鲜条目时为 null
}
```

- [ ] **Step 2: 类型检查通过**

Run: `npx tsc --noEmit`
Expected: 无新增类型错误。

- [ ] **Step 3: Commit**

```bash
git add lib/ingest/types.ts && git commit -m "feat: add ingest pipeline intermediate types"
```

---

## Task 2：新鲜度过滤（纯函数 TDD）

**Files:**
- Create: `lib/ingest/freshness.ts`
- Test: `tests/ingest/freshness.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from "vitest";
import { filterFreshItems } from "@/lib/ingest/freshness";
import type { GeminiNewsItem } from "@/lib/ingest/types";

const item = (url: string, publishedDate: string | null): GeminiNewsItem => ({
  title: url,
  url,
  publishedDate,
  summary: "",
});

describe("filterFreshItems", () => {
  const now = "2026-06-15T00:00:00.000Z";

  it("keeps items within the window", () => {
    const items = [item("a", "2026-06-10"), item("b", "2026-06-14")];
    expect(filterFreshItems(items, now, 7).map((i) => i.url)).toEqual(["a", "b"]);
  });

  it("drops items older than the window", () => {
    const items = [item("old", "2026-06-01"), item("ok", "2026-06-12")];
    expect(filterFreshItems(items, now, 7).map((i) => i.url)).toEqual(["ok"]);
  });

  it("drops items with no publishedDate (cannot prove freshness)", () => {
    expect(filterFreshItems([item("x", null)], now, 7)).toEqual([]);
  });

  it("drops future-dated items (likely parse error)", () => {
    expect(filterFreshItems([item("future", "2026-07-01")], now, 7)).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ingest/freshness.test.ts`
Expected: FAIL（`filterFreshItems` 未定义）。

- [ ] **Step 3: 实现**

```typescript
import type { GeminiNewsItem } from "@/lib/ingest/types";

/**
 * 仅保留 publishedDate 落在 [now - windowDays, now] 的条目。
 * 无日期或未来日期一律丢弃（无法证明新鲜 / 多半是解析错误）。
 */
export function filterFreshItems(
  items: readonly GeminiNewsItem[],
  nowISO: string,
  windowDays: number,
): GeminiNewsItem[] {
  const now = new Date(nowISO).getTime();
  const lower = now - windowDays * 24 * 60 * 60 * 1000;
  return items.filter((it) => {
    if (!it.publishedDate) return false;
    const t = new Date(it.publishedDate).getTime();
    if (Number.isNaN(t)) return false;
    return t >= lower && t <= now;
  });
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ingest/freshness.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/freshness.ts tests/ingest/freshness.test.ts && git commit -m "feat: add freshness window filter"
```

---

## Task 3：Gemini grounding 搜索客户端（注入式 TDD）

**Files:**
- Create: `lib/ingest/gemini-search.ts`
- Test: `tests/ingest/gemini-search.test.ts`

设计：核心导出 `parseGeminiResponse(text, groundingChunks)`（纯，可测）+ `searchRecentNews(opts, deps)`（deps 注入 `generate` 函数，默认走真 SDK）。

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from "vitest";
import { parseGeminiResponse, buildSearchPrompt } from "@/lib/ingest/gemini-search";

describe("buildSearchPrompt", () => {
  it("includes absolute date window and brand", () => {
    const p = buildSearchPrompt("SpaceX", "2026-06-08", "2026-06-15");
    expect(p).toContain("SpaceX");
    expect(p).toContain("2026-06-08");
    expect(p).toContain("2026-06-15");
    expect(p.toLowerCase()).toContain("json");
  });
});

describe("parseGeminiResponse", () => {
  it("parses a JSON array embedded in text", () => {
    const text =
      'Here are results:\n```json\n[{"title":"T","url":"https://x.com/a","publishedDate":"2026-06-14","summary":"s"}]\n```';
    const items = parseGeminiResponse(text, []);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://x.com/a");
  });

  it("returns [] on unparseable text", () => {
    expect(parseGeminiResponse("no json here", [])).toEqual([]);
  });

  it("backfills missing url from grounding chunks by order", () => {
    const text = '[{"title":"T","url":"","publishedDate":"2026-06-14","summary":"s"}]';
    const items = parseGeminiResponse(text, [{ web: { uri: "https://src/1", title: "T" } }]);
    expect(items[0].url).toBe("https://src/1");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ingest/gemini-search.test.ts`
Expected: FAIL（函数未定义）。

- [ ] **Step 3: 实现**

```typescript
import { GoogleGenAI } from "@google/genai";
import type { GeminiNewsItem } from "@/lib/ingest/types";

export interface GroundingChunk {
  web?: { uri?: string; title?: string };
}

export function buildSearchPrompt(
  brand: string,
  sinceDate: string,
  todayDate: string,
): string {
  return [
    `今天是 ${todayDate}。请用 Google 搜索，找出关于「${brand}」的航天相关新闻，要求所报道的【事件本身发生】在 ${sinceDate} 至 ${todayDate}（最近一周）之内。`,
    `排除：事件发生在该窗口之外的旧闻、周年回顾、背景科普、综述类文章——即使它们是最近才发布的。`,
    `严格只输出一个 JSON 数组（可包在 \`\`\`json 代码块里），每个元素形如：`,
    `{"title": string, "url": string, "publishedDate": "YYYY-MM-DD", "summary": string}`,
    `publishedDate 必须是该报道的真实发布日期；不确定就省略该条。不要输出 JSON 以外的解释。`,
  ].join("\n");
}

/** 从可能夹带文字/代码块的文本里提取 JSON 数组并归一化 */
export function parseGeminiResponse(
  text: string,
  groundingChunks: readonly GroundingChunk[],
): GeminiNewsItem[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const chunkUrls = groundingChunks
    .map((c) => c.web?.uri)
    .filter((u): u is string => Boolean(u));
  return raw.map((r, i): GeminiNewsItem => {
    const o = (r ?? {}) as Record<string, unknown>;
    const url = (typeof o.url === "string" && o.url) || chunkUrls[i] || "";
    return {
      title: typeof o.title === "string" ? o.title : "",
      url,
      publishedDate:
        typeof o.publishedDate === "string" && o.publishedDate ? o.publishedDate : null,
      summary: typeof o.summary === "string" ? o.summary : "",
    };
  }).filter((it) => it.url);
}

export interface SearchDeps {
  generate: (
    prompt: string,
  ) => Promise<{ text: string; groundingChunks: GroundingChunk[] }>;
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
      return { text: res.text ?? "", groundingChunks: chunks as GroundingChunk[] };
    },
  };
}

export async function searchRecentNews(
  opts: { brand: string; sinceDate: string; todayDate: string },
  deps: SearchDeps = defaultDeps(),
): Promise<GeminiNewsItem[]> {
  const prompt = buildSearchPrompt(opts.brand, opts.sinceDate, opts.todayDate);
  const { text, groundingChunks } = await deps.generate(prompt);
  return parseGeminiResponse(text, groundingChunks);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ingest/gemini-search.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/gemini-search.ts tests/ingest/gemini-search.test.ts && git commit -m "feat: add gemini grounding search client"
```

---

## Task 4：DeepSeek 分析客户端（注入式 TDD）

**Files:**
- Create: `lib/ingest/deepseek-analyze.ts`
- Test: `tests/ingest/deepseek-analyze.test.ts`

设计：`buildAnalyzePrompt(brand, items)`（纯）+ `parseAnalysis(jsonText)`（纯，校验+默认值）+ `analyzeBrief(opts, deps)`（deps 注入 `complete`）。

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from "vitest";
import { buildAnalyzePrompt, parseAnalysis } from "@/lib/ingest/deepseek-analyze";

describe("buildAnalyzePrompt", () => {
  it("mentions json and includes item titles", () => {
    const p = buildAnalyzePrompt("SpaceX", [
      { title: "Starship flew", url: "u", publishedDate: "2026-06-14", summary: "s" },
    ]);
    expect(p.toLowerCase()).toContain("json");
    expect(p).toContain("Starship flew");
  });
});

describe("parseAnalysis", () => {
  it("parses valid analysis json", () => {
    const json = JSON.stringify({
      signalType: "technical_project_milestone",
      headline: "h",
      summary: "s",
      eventDate: "2026-06-14",
      confidence: 0.8,
      briefTitle: "bt",
      factSummary: "fs",
      whyItMatters: "w",
      possibleAngles: ["a"],
      openQuestions: ["q"],
      riskNotes: ["r"],
      score: {
        freshnessScore: 5, importanceScore: 4, rarityScore: 3,
        audienceInterestScore: 4, visualPotentialScore: 5, riskScore: 2,
        overallRecommendation: "strong", scoringNotes: "n",
      },
    });
    const a = parseAnalysis(json);
    expect(a?.signalType).toBe("technical_project_milestone");
    expect(a?.score.freshnessScore).toBe(5);
  });

  it("returns null on invalid signalType", () => {
    expect(parseAnalysis(JSON.stringify({ signalType: "bogus" }))).toBeNull();
  });

  it("returns null on non-json", () => {
    expect(parseAnalysis("oops")).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ingest/deepseek-analyze.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```typescript
import OpenAI from "openai";
import type { GeminiNewsItem, AnalyzedBrief } from "@/lib/ingest/types";
import type { CandidateSignalType } from "@/lib/domain/types";

const SIGNAL_TYPES: CandidateSignalType[] = [
  "technical_project_milestone",
  "location_facility_change",
  "policy_regulatory_change",
];

export function buildAnalyzePrompt(brand: string, items: readonly GeminiNewsItem[]): string {
  const list = items
    .map((it, i) => `${i + 1}. [${it.publishedDate ?? "?"}] ${it.title} — ${it.summary} (${it.url})`)
    .join("\n");
  return [
    `你是航天领域的选题编辑。下面是关于「${brand}」最近一周的新闻条目：`,
    list,
    ``,
    `请综合这些条目，输出一个 JSON 对象（只输出 json，不要解释），字段如下，并给出一个示例值：`,
    `{`,
    `  "signalType": "technical_project_milestone" | "location_facility_change" | "policy_regulatory_change",`,
    `  "headline": "一句话信号标题",`,
    `  "summary": "2-3 句事实摘要",`,
    `  "eventDate": "YYYY-MM-DD 或 null",`,
    `  "confidence": 0.0~1.0,`,
    `  "briefTitle": "简报标题",`,
    `  "factSummary": "事实综述",`,
    `  "whyItMatters": "为什么重要",`,
    `  "possibleAngles": ["角度1","角度2"],`,
    `  "openQuestions": ["问题1"],`,
    `  "riskNotes": ["风险1"],`,
    `  "score": {"freshnessScore":1-5,"importanceScore":1-5,"rarityScore":1-5,"audienceInterestScore":1-5,"visualPotentialScore":1-5,"riskScore":1-5,"overallRecommendation":"strong|medium|weak","scoringNotes":"打分理由"}`,
    `}`,
  ].join("\n");
}

function n1to5(v: unknown): number {
  const x = Math.round(Number(v));
  return Number.isFinite(x) ? Math.min(5, Math.max(1, x)) : 3;
}

export function parseAnalysis(jsonText: string): AnalyzedBrief | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  if (!SIGNAL_TYPES.includes(o.signalType as CandidateSignalType)) return null;
  const s = (o.score ?? {}) as Record<string, unknown>;
  const rec = s.overallRecommendation;
  return {
    signalType: o.signalType as CandidateSignalType,
    headline: String(o.headline ?? ""),
    summary: String(o.summary ?? ""),
    eventDate: typeof o.eventDate === "string" && o.eventDate ? o.eventDate : null,
    confidence: Math.min(1, Math.max(0, Number(o.confidence) || 0.5)),
    briefTitle: String(o.briefTitle ?? o.headline ?? ""),
    factSummary: String(o.factSummary ?? o.summary ?? ""),
    whyItMatters: String(o.whyItMatters ?? ""),
    possibleAngles: Array.isArray(o.possibleAngles) ? o.possibleAngles.map(String) : [],
    openQuestions: Array.isArray(o.openQuestions) ? o.openQuestions.map(String) : [],
    riskNotes: Array.isArray(o.riskNotes) ? o.riskNotes.map(String) : [],
    score: {
      freshnessScore: n1to5(s.freshnessScore),
      importanceScore: n1to5(s.importanceScore),
      rarityScore: n1to5(s.rarityScore),
      audienceInterestScore: n1to5(s.audienceInterestScore),
      visualPotentialScore: n1to5(s.visualPotentialScore),
      riskScore: n1to5(s.riskScore),
      overallRecommendation:
        rec === "strong" || rec === "medium" || rec === "weak" ? rec : "medium",
      scoringNotes: String(s.scoringNotes ?? ""),
    },
  };
}

export interface AnalyzeDeps {
  complete: (prompt: string) => Promise<string>;
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
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

export async function analyzeBrief(
  opts: { brand: string; items: GeminiNewsItem[] },
  deps: AnalyzeDeps = defaultDeps(),
): Promise<AnalyzedBrief | null> {
  if (opts.items.length === 0) return null;
  const out = await deps.complete(buildAnalyzePrompt(opts.brand, opts.items));
  return parseAnalysis(out);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ingest/deepseek-analyze.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/deepseek-analyze.ts tests/ingest/deepseek-analyze.test.ts && git commit -m "feat: add deepseek analysis client"
```

---

## Task 5：流水线编排（注入式 TDD）

**Files:**
- Create: `lib/ingest/pipeline.ts`
- Test: `tests/ingest/pipeline.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from "vitest";
import { runIngestForBrand } from "@/lib/ingest/pipeline";
import { canonicalizeUrl } from "@/lib/search/dedupe";
import type { GeminiNewsItem, AnalyzedBrief } from "@/lib/ingest/types";

const analyzed: AnalyzedBrief = {
  signalType: "technical_project_milestone", headline: "h", summary: "s",
  eventDate: "2026-06-14", confidence: 0.9, briefTitle: "bt", factSummary: "fs",
  whyItMatters: "w", possibleAngles: [], openQuestions: [], riskNotes: [],
  score: { freshnessScore: 5, importanceScore: 4, rarityScore: 3, audienceInterestScore: 4, visualPotentialScore: 5, riskScore: 2, overallRecommendation: "strong", scoringNotes: "n" },
};

const brand = { id: "uuid-1", name: "SpaceX", aliases: [], keywords: [], excludedTerms: [], languages: [], regions: [] };

it("filters stale, dedupes, then analyzes", async () => {
  const items: GeminiNewsItem[] = [
    { title: "fresh", url: "https://a/1", publishedDate: "2026-06-14", summary: "" },
    { title: "dup", url: "https://a/1?utm=x", publishedDate: "2026-06-14", summary: "" },
    { title: "stale", url: "https://a/2", publishedDate: "2026-01-01", summary: "" },
  ];
  let analyzedWith: GeminiNewsItem[] = [];
  const res = await runIngestForBrand(brand, {
    now: "2026-06-15T00:00:00.000Z",
    windowDays: 7,
    search: async () => items,
    analyze: async (b, its) => { analyzedWith = its; return analyzed; },
  });
  expect(res.freshItems.map((i) => i.url)).toEqual(["https://a/1"]); // stale dropped + dedup
  expect(analyzedWith).toHaveLength(1);
  expect(res.analyzed?.headline).toBe("h");
});

it("skips analysis when no fresh items", async () => {
  const res = await runIngestForBrand(brand, {
    now: "2026-06-15T00:00:00.000Z", windowDays: 7,
    search: async () => [{ title: "stale", url: "https://a/9", publishedDate: "2026-01-01", summary: "" }],
    analyze: async () => analyzed,
  });
  expect(res.freshItems).toEqual([]);
  expect(res.analyzed).toBeNull();
});

it("drops items already seen in previous runs (cross-run dedup) before analyzing", async () => {
  let analyzeCalled = false;
  const res = await runIngestForBrand(brand, {
    now: "2026-06-15T00:00:00.000Z", windowDays: 7,
    seenCanonicalUrls: new Set([canonicalizeUrl("https://a/1")]),
    search: async () => [
      { title: "seen-yesterday", url: "https://a/1", publishedDate: "2026-06-14", summary: "" },
    ],
    analyze: async () => { analyzeCalled = true; return analyzed; },
  });
  expect(res.freshItems).toEqual([]);
  expect(res.analyzed).toBeNull();
  expect(analyzeCalled).toBe(false); // 没浪费 DeepSeek 调用
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/ingest/pipeline.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现**

```typescript
import type { TrackingObject } from "@/lib/domain/types";
import type { GeminiNewsItem, AnalyzedBrief, IngestResult } from "@/lib/ingest/types";
import { filterFreshItems } from "@/lib/ingest/freshness";
import { canonicalizeUrl, dedupeByCanonicalUrl } from "@/lib/search/dedupe";
import { buildTrackingObjectQueries } from "@/lib/search/query-builder";

export interface PipelineDeps {
  now: string;
  windowDays: number;
  /** 以往运行已处理过的 canonical url 集合，用于跨运行去重（分析前过滤，避免重复调用 DeepSeek） */
  seenCanonicalUrls?: Set<string>;
  search: (brand: string, sinceDate: string, todayDate: string) => Promise<GeminiNewsItem[]>;
  analyze: (brand: string, items: GeminiNewsItem[]) => Promise<AnalyzedBrief | null>;
}

type BrandInput = Pick<
  TrackingObject,
  "id" | "name" | "aliases" | "keywords" | "excludedTerms" | "languages" | "regions"
>;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function runIngestForBrand(
  brand: BrandInput,
  deps: PipelineDeps,
): Promise<IngestResult> {
  const today = isoDate(new Date(deps.now));
  const since = isoDate(new Date(new Date(deps.now).getTime() - deps.windowDays * 86400000));
  const querySet = buildTrackingObjectQueries(brand as TrackingObject);

  const raw = await deps.search(brand.name, since, today);
  // 窗口过滤 → 运行内去重 → 跨运行去重（剔掉以往已处理过的）
  const withinRun = dedupeByCanonicalUrl(filterFreshItems(raw, deps.now, deps.windowDays));
  const seen = deps.seenCanonicalUrls ?? new Set<string>();
  const fresh = withinRun.filter((it) => !seen.has(canonicalizeUrl(it.url)));
  const analyzed = fresh.length > 0 ? await deps.analyze(brand.name, fresh) : null;

  return { trackingObjectId: brand.id, querySet, freshItems: fresh, analyzed };
}
```

> 注：`dedupeByCanonicalUrl` 接受带 `url` 字段的对象数组（`GeminiNewsItem` 含 `url`），与 `lib/search/dedupe.ts` 现有签名兼容；若签名不符，在该步调整为先 `.map` 出 url 再去重并回选。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/ingest/pipeline.test.ts`
Expected: PASS（3 个用例）。先确认 `dedupeByCanonicalUrl` 泛型签名兼容 `GeminiNewsItem`；不兼容则按上面注释微调。

- [ ] **Step 5: Commit**

```bash
git add lib/ingest/pipeline.ts tests/ingest/pipeline.test.ts && git commit -m "feat: add ingest pipeline orchestration"
```

---

## Task 6：Supabase 客户端 + 幂等写入

**Files:**
- Create: `lib/db/supabase.ts`
- Create: `lib/db/ingest-writer.ts`

无单测（纯集成 IO，靠 Task 8 实跑验证）。

- [ ] **Step 1: 写 Supabase 客户端工厂**

`lib/db/supabase.ts`:
```typescript
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 2: 写幂等写入器**

`lib/db/ingest-writer.ts`:
```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IngestResult } from "@/lib/ingest/types";

/**
 * 幂等写入一次品牌的产出：
 * search_run → sources(upsert on url) → candidate_signal(upsert on (tracking_object_id,dedupe_key))
 * → editorial_brief → content_value_score。
 * dedupeKey = 该信号首条 source 的 canonical url（足以保证同一品牌同事件不重复）。
 */
export async function writeIngestResult(
  db: SupabaseClient,
  result: IngestResult,
): Promise<{ wrote: boolean; reason?: string }> {
  const { trackingObjectId, querySet, freshItems, analyzed } = result;

  // 1. search_run（记录每次运行，便于 UI 显示）
  const { data: run, error: runErr } = await db
    .from("search_runs")
    .insert({
      tracking_object_id: trackingObjectId,
      query_set: querySet,
      status: analyzed ? "completed" : "completed",
      result_count: freshItems.length,
      new_signal_count: analyzed ? 1 : 0,
    })
    .select("id")
    .single();
  if (runErr) return { wrote: false, reason: `search_run: ${runErr.message}` };
  if (!analyzed || freshItems.length === 0) return { wrote: false, reason: "no fresh items" };

  // 2. sources（按 url 唯一 upsert，取回 id）
  const sourceRows = freshItems.map((it) => ({
    url: it.url,
    title: it.title || it.url,
    published_at: it.publishedDate ? `${it.publishedDate}T00:00:00Z` : null,
    source_type: "authoritative_media" as const,
    confidence: 0.7,
  }));
  const { data: sources, error: srcErr } = await db
    .from("sources")
    .upsert(sourceRows, { onConflict: "url" })
    .select("id");
  if (srcErr) return { wrote: false, reason: `sources: ${srcErr.message}` };
  const sourceIds = (sources ?? []).map((s) => s.id as string);

  // 3. candidate_signal（按 (tracking_object_id, dedupe_key) 幂等）
  const dedupeKey = freshItems[0].url;
  const { data: signal, error: sigErr } = await db
    .from("candidate_signals")
    .upsert(
      {
        tracking_object_id: trackingObjectId,
        search_run_id: run.id,
        signal_type: analyzed.signalType,
        headline: analyzed.headline,
        summary: analyzed.summary,
        event_date: analyzed.eventDate,
        source_ids: sourceIds,
        dedupe_key: dedupeKey,
        novelty_status: "new",
        confidence: analyzed.confidence,
      },
      { onConflict: "tracking_object_id,dedupe_key" },
    )
    .select("id")
    .single();
  if (sigErr) return { wrote: false, reason: `signal: ${sigErr.message}` };

  // 4. editorial_brief（按 candidate_signal_id 唯一 upsert）
  const { data: brief, error: brErr } = await db
    .from("editorial_briefs")
    .upsert(
      {
        candidate_signal_id: signal.id,
        tracking_object_id: trackingObjectId,
        brief_title: analyzed.briefTitle,
        fact_summary: analyzed.factSummary,
        source_summary: freshItems.map((i) => i.title).join("; "),
        why_it_matters: analyzed.whyItMatters,
        possible_angles: analyzed.possibleAngles,
        open_questions: analyzed.openQuestions,
        risk_notes: analyzed.riskNotes,
        status: "ready_for_screening",
      },
      { onConflict: "candidate_signal_id" },
    )
    .select("id")
    .single();
  if (brErr) return { wrote: false, reason: `brief: ${brErr.message}` };

  // 5. content_value_score（按 editorial_brief_id 主键 upsert）
  const sc = analyzed.score;
  const { error: scErr } = await db.from("content_value_scores").upsert({
    editorial_brief_id: brief.id,
    freshness_score: sc.freshnessScore,
    importance_score: sc.importanceScore,
    rarity_score: sc.rarityScore,
    audience_interest_score: sc.audienceInterestScore,
    visual_potential_score: sc.visualPotentialScore,
    risk_score: sc.riskScore,
    overall_recommendation: sc.overallRecommendation,
    scoring_notes: sc.scoringNotes,
  });
  if (scErr) return { wrote: false, reason: `score: ${scErr.message}` };

  return { wrote: true };
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 4: Commit**

```bash
git add lib/db/supabase.ts lib/db/ingest-writer.ts && git commit -m "feat: add supabase client and idempotent ingest writer"
```

---

## Task 7：`/api/ingest` 路由

**Files:**
- Create: `app/api/ingest/route.ts`

- [ ] **Step 1: 实现路由**

```typescript
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/db/supabase";
import { runIngestForBrand } from "@/lib/ingest/pipeline";
import { searchRecentNews } from "@/lib/ingest/gemini-search";
import { analyzeBrief } from "@/lib/ingest/deepseek-analyze";
import { writeIngestResult } from "@/lib/db/ingest-writer";
import { canonicalizeUrl } from "@/lib/search/dedupe";

export const maxDuration = 300; // 允许长时间运行（Vercel）

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getServiceClient();
  const { data: brands, error } = await db
    .from("tracking_objects")
    .select("id, name, aliases, keywords, excluded_terms, languages, regions");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 跨运行去重：加载已入库的 source url（canonical），分析前剔除已处理过的。
  // v1 全量加载；量大后可改为只取最近 windowDays 内的 published_at。
  const { data: seenRows } = await db.from("sources").select("url");
  const seenCanonicalUrls = new Set(
    (seenRows ?? []).map((r) => canonicalizeUrl(r.url as string)),
  );

  const now = new Date().toISOString();
  const summary: { brand: string; wrote: boolean; reason?: string }[] = [];

  for (const b of brands ?? []) {
    try {
      const result = await runIngestForBrand(
        {
          id: b.id, name: b.name, aliases: b.aliases ?? [],
          keywords: b.keywords ?? [], excludedTerms: b.excluded_terms ?? [],
          languages: b.languages ?? [], regions: b.regions ?? [],
        },
        {
          now, windowDays: 7,
          seenCanonicalUrls,
          search: (brand, since, today) => searchRecentNews({ brand, sinceDate: since, todayDate: today }),
          analyze: (brand, items) => analyzeBrief({ brand, items }),
        },
      );
      const w = await writeIngestResult(db, result);
      summary.push({ brand: b.name, wrote: w.wrote, reason: w.reason });
    } catch (e) {
      summary.push({ brand: b.name, wrote: false, reason: (e as Error).message });
    }
  }

  return NextResponse.json({ ran: summary.length, summary });
}
```

- [ ] **Step 2: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 构建成功，`/api/ingest` 出现在路由清单。

- [ ] **Step 3: Commit**

```bash
git add app/api/ingest/route.ts && git commit -m "feat: add /api/ingest route handler"
```

---

## Task 8：本地实跑验证（需要 key）

**Files:** 无（验证步骤）

- [ ] **Step 1: 准备 `.env.local`**

把 `GEMINI_API_KEY`、`DEEPSEEK_API_KEY`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`INGEST_SECRET` 填入 `.env.local`。确认 Supabase 已建表，且 `tracking_objects` 至少 1 条（如 SpaceX）。

- [ ] **Step 2: 起服务并触发**

Run:
```bash
npm run dev &
sleep 5
curl -s -X POST http://localhost:3000/api/ingest -H "Authorization: Bearer $INGEST_SECRET" | head -c 2000
```
Expected: 返回 `{ "ran": N, "summary": [...] }`，至少有品牌 `wrote: true`。

- [ ] **Step 3: 在 Supabase 核对**

在 Supabase 后台查 `editorial_briefs` / `content_value_scores`：应出现真实简报，且 `sources.url` 是真实文章链接（非首页）、`published_at` 在近一周内。

- [ ] **Step 4: 幂等性验证**

再次触发同一请求；确认 `candidate_signals` 不因重复 url 报错、不产生重复行（靠 (tracking_object_id, dedupe_key) 唯一约束）。

---

## Task 9：Vercel Cron 调度

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: 写 cron 配置**

```json
{
  "crons": [
    { "path": "/api/ingest", "schedule": "0 0 * * *" }
  ]
}
```

> Vercel Cron 默认对该路径发 GET。两种适配二选一：(a) 在 `route.ts` 增加 `export async function GET(req)`，校验 Vercel 注入的 `Authorization: Bearer ${CRON_SECRET}`（在 Vercel 项目设置 `CRON_SECRET` 环境变量，Vercel 会自动带上）；(b) 保持 POST，改用外部定时器。推荐 (a)：把当前 POST 逻辑抽成 `handle(req)`，GET/POST 都调它，鉴权同时接受 `INGEST_SECRET` 或 `CRON_SECRET`。

- [ ] **Step 2: 调整 route 支持 GET（Vercel Cron 用）**

在 `app/api/ingest/route.ts`：把主体抽成 `async function handle(req: Request)`，新增：
```typescript
export async function GET(req: Request) { return handle(req); }
export async function POST(req: Request) { return handle(req); }
```
鉴权改为：接受 `Authorization === \`Bearer ${process.env.INGEST_SECRET}\`` 或 `=== \`Bearer ${process.env.CRON_SECRET}\``。

- [ ] **Step 3: 部署并在 Vercel 配置环境变量**

在 Vercel 项目设置里配齐 5 个 env + `CRON_SECRET`，部署。Vercel Dashboard → Cron 应显示该任务。

- [ ] **Step 4: Commit**

```bash
git add vercel.json app/api/ingest/route.ts && git commit -m "feat: schedule daily ingest via vercel cron"
```

---

## 自检（spec 覆盖）

- Gemini grounding 搜索 → Task 3 ✓
- 新鲜度保障（绝对日期 prompt + 回填日期 + 窗口过滤 + 去重）→ Task 2/3/5 ✓
- DeepSeek 结构化分析 → Task 4 ✓
- 复用 lib/（dedupe、query-builder、scoring 类型、domain types）→ Task 5/6 ✓
- 写 Supabase（幂等）→ Task 6 ✓
- Vercel 每日 Cron → Task 9 ✓
- 成本：本流水线无新增固定成本（Gemini 免费档内、DeepSeek 按量）→ 见 spec §8

## 后续（不在本计划）

- **Layer 1：工作台改读 Supabase**。当前 `WorkflowProvider`（`components/workbench/workflow-provider.tsx`）是客户端内存应用、从 `phase1-fixtures` 同步建状态，且用字符串 id；改读 Supabase 需：服务端加载器（row→domain，处理 snake_case + UUID）、把初始状态从服务端组件注入 Provider、seed 现有 fixtures 入库保证 UI 不空。**另立 spec + plan**。
- **Phase 2**：薄 RSS 兜底（`space-feeds-verified.opml` 19 源）、X 接入、源清单维护。
