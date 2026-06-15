# A2 · DeepSeek 脚本/分镜生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把工作台生产工作室的脚本+分镜从 `createStubProduction` 纯模板升级为 DeepSeek 真实生成,保留二次编辑与确定性兜底。

**Architecture:** 纯函数引擎(镜像 `lib/ingest`,依赖注入可测)→ server action 异步入口 → 同步 reducer 写 state → 工作室手动按钮触发。`task` 段保持确定性脚手架;`b-cna-01` 精品包作 few-shot;失败回退 stub。

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · OpenAI SDK(指向 `https://api.deepseek.com`,模型 `deepseek-v4-flash`)· vitest。

**Worktree:** 全程在 `/Users/fengzhou/Code/lhh-news-ingestion`(分支 `feature/news-ingestion`)。开工前确认 `node_modules` 可用(若缺,从主目录软链:`ln -s /Users/fengzhou/Code/LHH/node_modules /Users/fengzhou/Code/lhh-news-ingestion/node_modules`)。**精确 `git add <file>`,绝不 `git add -A`。**

**测试命令统一:** `npx vitest run <path>`(单文件)/ `npx vitest run`(全量)。`tsc`:`npx tsc --noEmit`。

---

## Task 1: 抽出 `buildTaskScaffold` 与 `deriveTargetDuration`(为引擎与 stub 共用,DRY)

**Files:**
- Modify: `lib/production/stub-production.ts`
- Test: `tests/production/stub-production.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

```ts
// tests/production/stub-production.test.ts
import { describe, it, expect } from "vitest";
import { buildTaskScaffold, deriveTargetDuration } from "@/lib/production/stub-production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

const brief = { id: "b1", briefTitle: "测试简报" } as EditorialBrief;
const card = { id: "t1", workingTitle: "测试选题", formatLabel: "深度长视频（12-15 min）" } as TopicCard;

describe("deriveTargetDuration", () => {
  it("从 formatLabel 解析时长", () => {
    expect(deriveTargetDuration("深度长视频（12-15 min）")).toBe("12-15 min");
  });
  it("无法解析时回退 5-8 min", () => {
    expect(deriveTargetDuration("竖屏短视频")).toBe("5-8 min");
  });
});

describe("buildTaskScaffold", () => {
  it("用 workingTitle 作标题、formatLabel 作格式", () => {
    const task = buildTaskScaffold(brief, card);
    expect(task.title).toBe("测试选题");
    expect(task.format).toBe("深度长视频（12-15 min）");
    expect(task.checklist.length).toBeGreaterThanOrEqual(7);
    expect(task.checklist.every((c) => c.done === false)).toBe(true);
  });
  it("无 topicCard 时回退 brief.briefTitle", () => {
    const task = buildTaskScaffold(brief, null);
    expect(task.title).toBe("测试简报");
    expect(task.format).toBe("深度短视频（5-8 min）");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/production/stub-production.test.ts`
Expected: FAIL —— `buildTaskScaffold`/`deriveTargetDuration` 未导出。

- [ ] **Step 3: 重构 stub-production.ts 抽出两个具名导出,`createStubProduction` 复用之**

```ts
// lib/production/stub-production.ts —— 顶部 import 不变,新增以下两个具名导出,并改造 createStubProduction
import type { ProductionPackage, ProductionTask } from "@/lib/domain/production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

function stripSubtitle(value: string): string {
  return value.replace(/[：:].*$/, "");
}

/** 从自由文本 formatLabel 中解析"目标时长",失败回退 5-8 min。 */
export function deriveTargetDuration(formatLabel: string): string {
  return formatLabel.match(/(\d+[-–~]?\d*\s*min)/i)?.[1] ?? "5-8 min";
}

/** 确定性运营脚手架(checklist/owner/deadline 等);脚本与分镜由 LLM 或 stub 另产。 */
export function buildTaskScaffold(brief: EditorialBrief, topicCard?: TopicCard | null): ProductionTask {
  const workingTitle = topicCard?.workingTitle ?? brief.briefTitle;
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  return {
    title: workingTitle,
    format: formatLabel,
    channel: "YouTube · B站 · 微信视频号",
    owner: "林哈哈（主笔） · 待分配（剪辑）",
    deadline: "待定（建议 14 个工作日内）",
    budget: "待估算",
    checklist: [
      { id: "k1", label: "脚本一稿核查（事实 + 引述）", done: false, who: "研究员" },
      { id: "k2", label: "关键来源版权确认", done: false, who: "研究员" },
      { id: "k3", label: "B-roll 采购清单", done: false, who: "剪辑" },
      { id: "k4", label: "配音录制", done: false, who: "林哈哈" },
      { id: "k5", label: "剪辑一稿", done: false, who: "剪辑" },
      { id: "k6", label: "审片 + 上字幕", done: false, who: "林哈哈" },
      { id: "k7", label: "发布与跨平台分发", done: false, who: "社媒" },
    ],
  };
}

export function createStubProduction(brief: EditorialBrief, topicCard?: TopicCard | null): ProductionPackage {
  const facts = brief.factBullets ?? [brief.factSummary];
  const tagline = brief.tagline ?? brief.briefTitle;
  const coreQuestion = topicCard?.coreQuestion ?? "这件事对读者意味着什么？";
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  const targetDuration = deriveTargetDuration(formatLabel);

  return {
    script: {
      targetDuration,
      wordCount: 980,
      sections: [
        { id: "hook", label: "开场 · 钩子（草稿）", duration: "0:00–0:30", body: `${tagline}。\n这是一个一眼看上去技术、但实际上正在重写整个赛道经济学的事件。\n（编辑可在此处替换为面向自有读者群的开场。）` },
        { id: "context", label: "背景（草稿）", duration: "0:30–2:00", body: facts.join("\n") },
        { id: "core", label: "为什么重要（草稿）", duration: "2:00–5:00", body: brief.whyItMatters },
        { id: "close", label: "收束（草稿）", duration: "5:00–6:00", body: `回到一个问题：${coreQuestion}\n（建议编辑用一个具体的画面或反问收束。）` },
      ],
    },
    storyboard: [
      { n: 1, time: "0:00-0:08", shot: "标题卡", voiceOver: "（无）", visual: `${stripSubtitle(brief.briefTitle)} · 字幕`, notes: "配乐 IN · 模板套用" },
      { n: 2, time: "0:08-0:30", shot: "钩子镜头", voiceOver: tagline, visual: "主视觉 + 关键数字浮现", notes: "需要主视觉设计" },
      { n: 3, time: "0:30-2:00", shot: "背景陈述", voiceOver: facts[0] ?? "", visual: "资料镜头 / 时间线", notes: "版权待核" },
      { n: 4, time: "2:00-3:30", shot: "核心论证 A", voiceOver: facts[1] ?? "", visual: "示意图 / 数据可视化", notes: "设计师交付" },
      { n: 5, time: "3:30-5:00", shot: "核心论证 B", voiceOver: facts[2] ?? brief.whyItMatters.slice(0, 60), visual: "对比镜头", notes: "可用 B-roll" },
      { n: 6, time: "5:00-6:00", shot: "收束 · 问题卡", voiceOver: coreQuestion, visual: "回到标题排版", notes: "配乐 OUT" },
    ],
    task: buildTaskScaffold(brief, topicCard),
  };
}
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `npx vitest run tests/production/stub-production.test.ts && npx vitest run`
Expected: 新测试 PASS;原有用例无回归(stub 输出结构不变)。

- [ ] **Step 5: 提交**

```bash
git add lib/production/stub-production.ts tests/production/stub-production.test.ts
git commit -m "refactor: extract buildTaskScaffold + deriveTargetDuration from stub"
```

---

## Task 2: `buildScriptPrompt`(纯函数,含 b-cna-01 few-shot)

**Files:**
- Create: `lib/production/deepseek-script.ts`
- Test: `tests/production/deepseek-script.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

```ts
// tests/production/deepseek-script.test.ts
import { describe, it, expect } from "vitest";
import { buildScriptPrompt } from "@/lib/production/deepseek-script";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

const brief = {
  id: "b1", briefTitle: "中国月球计划国际化",
  tagline: "从单干到搭载", factSummary: "嫦娥八号搭载 13 国 21 项目",
  factBullets: ["13 个国家", "21 个研究项目", "前往月球南极"],
  whyItMatters: "这是把上月球这件事重新分配", possibleAngles: [], openQuestions: [], riskNotes: [],
} as unknown as EditorialBrief;
const card = { id: "t1", workingTitle: "中国月球计划国际化", coreQuestion: "是不是同一个月球？", formatLabel: "深度长视频（12-15 min）" } as TopicCard;

describe("buildScriptPrompt", () => {
  const p = buildScriptPrompt(brief, card);
  it("含关键事实与核心问题", () => {
    expect(p).toContain("13 个国家");
    expect(p).toContain("是不是同一个月球？");
  });
  it("含 json 字样(json_object 模式要求)", () => {
    expect(p.toLowerCase()).toContain("json");
  });
  it("要求固定 4 段 id", () => {
    expect(p).toContain("hook");
    expect(p).toContain("close");
  });
  it("嵌入 b-cna-01 few-shot 范本(含其原文片段)", () => {
    expect(p).toContain("嫦娥"); // 范本正文中的标志词
  });
  it("要求分镜随时长伸缩(出现 targetDuration 提示)", () => {
    expect(p).toContain("12-15 min");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: FAIL —— 模块/函数不存在。

- [ ] **Step 3: 实现 `buildScriptPrompt`**

```ts
// lib/production/deepseek-script.ts
import OpenAI from "openai";
import type { ScriptSection, StoryboardShot } from "@/lib/domain/production";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { productions } from "@/lib/data/phase1-fixtures";
import { buildTaskScaffold, deriveTargetDuration } from "@/lib/production/stub-production";

const REQUIRED_SECTION_IDS = ["hook", "context", "core", "close"] as const;

/** 取 b-cna-01 精品包的 script+storyboard 作为 few-shot 范本(只读,单一来源)。 */
function exemplarBlock(): string {
  const ex = productions["b-cna-01"];
  if (!ex) return "";
  return JSON.stringify({ sections: ex.script.sections, storyboard: ex.storyboard }, null, 2);
}

export function buildScriptPrompt(brief: EditorialBrief, topicCard?: TopicCard | null): string {
  const facts = brief.factBullets ?? [brief.factSummary];
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  const targetDuration = deriveTargetDuration(formatLabel);
  const coreQuestion = topicCard?.coreQuestion ?? "这件事对读者意味着什么？";
  const workingTitle = topicCard?.workingTitle ?? brief.briefTitle;

  return [
    `你是"林哈哈聊太空"的主笔编辑。请基于下面这条航天简报，写一份短视频脚本与配套分镜。`,
    ``,
    `【选题】${workingTitle}`,
    `【核心问题】${coreQuestion}`,
    `【目标时长】${targetDuration}`,
    `【事实要点】`,
    ...facts.map((f) => `- ${f}`),
    `【为什么重要】${brief.whyItMatters}`,
    ``,
    `下面是一份高质量范本(注意它的叙事密度、口语化推进、用具体数字与画面收束的风格)，请向它看齐，但不要照抄内容：`,
    exemplarBlock(),
    ``,
    `请只输出一个 JSON 对象(不要解释、不要 markdown 代码块)，结构如下：`,
    `{`,
    `  "sections": [`,
    `    {"id":"hook","label":"开场 · 钩子","duration":"0:00–0:35","body":"……"},`,
    `    {"id":"context","label":"背景","duration":"……","body":"……"},`,
    `    {"id":"core","label":"核心 · 为什么重要","duration":"……","body":"……"},`,
    `    {"id":"close","label":"收束","duration":"……","body":"……"}`,
    `  ],`,
    `  "storyboard": [`,
    `    {"n":1,"time":"0:00-0:08","shot":"镜头描述","voiceOver":"旁白","visual":"画面","notes":"备注"}`,
    `  ]`,
    `}`,
    ``,
    `要求：`,
    `1. sections 必须恰好 4 段，id 依次为 hook/context/core/close，body 为中文、有信息量、可直接配音。`,
    `2. storyboard 条数随目标时长伸缩(约每 60-90 秒一镜；${targetDuration} 大致 ${storyboardHint(targetDuration)} 镜)，n 从 1 连续递增，time 覆盖整段时长，每条字段都要填。`,
    `3. 全程中文。只输出 json。`,
  ].join("\n");
}

/** 给模型一个分镜条数的量级提示(纯展示,不强校验)。 */
function storyboardHint(targetDuration: string): string {
  const m = targetDuration.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) return "6-8";
  const mid = (Number(m[1]) + Number(m[2])) / 2;
  const shots = Math.max(6, Math.round((mid * 60) / 75));
  return `${shots - 1}-${shots + 1}`;
}
```

> 说明:`REQUIRED_SECTION_IDS`、OpenAI import 在 Task 3/4 用到，此处先引入避免后续改 import。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/production/deepseek-script.ts tests/production/deepseek-script.test.ts
git commit -m "feat: buildScriptPrompt with b-cna-01 few-shot for production gen"
```

---

## Task 3: `parseProduction`(校验守卫)

**Files:**
- Modify: `lib/production/deepseek-script.ts`
- Test: `tests/production/deepseek-script.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/production/deepseek-script.test.ts
import { parseProduction } from "@/lib/production/deepseek-script";

const goodSections = [
  { id: "hook", label: "开场", duration: "0:00–0:35", body: "钩子正文" },
  { id: "context", label: "背景", duration: "0:35–3:00", body: "背景正文" },
  { id: "core", label: "核心", duration: "3:00–9:00", body: "核心正文" },
  { id: "close", label: "收束", duration: "9:00–12:00", body: "收束正文" },
];
const goodShots = Array.from({ length: 6 }, (_, i) => ({
  n: i + 1, time: `${i}:00-${i + 1}:00`, shot: `镜${i + 1}`, voiceOver: "旁白", visual: "画面", notes: "备注",
}));

describe("parseProduction", () => {
  it("合法 JSON → 返回 sections + storyboard", () => {
    const r = parseProduction(JSON.stringify({ sections: goodSections, storyboard: goodShots }));
    expect(r).not.toBeNull();
    expect(r!.sections).toHaveLength(4);
    expect(r!.storyboard).toHaveLength(6);
  });
  it("坏 JSON → null", () => {
    expect(parseProduction("not json")).toBeNull();
  });
  it("段数不足 4 → null", () => {
    expect(parseProduction(JSON.stringify({ sections: goodSections.slice(0, 3), storyboard: goodShots }))).toBeNull();
  });
  it("段 id 不命中 → null", () => {
    const bad = [...goodSections]; bad[0] = { ...bad[0], id: "intro" };
    expect(parseProduction(JSON.stringify({ sections: bad, storyboard: goodShots }))).toBeNull();
  });
  it("body 为空 → null", () => {
    const bad = [...goodSections]; bad[1] = { ...bad[1], body: "  " };
    expect(parseProduction(JSON.stringify({ sections: bad, storyboard: goodShots }))).toBeNull();
  });
  it("分镜少于 6 条 → null", () => {
    expect(parseProduction(JSON.stringify({ sections: goodSections, storyboard: goodShots.slice(0, 5) }))).toBeNull();
  });
  it("分镜字段缺失 → null", () => {
    const bad = [...goodShots]; bad[0] = { ...bad[0], visual: "" };
    expect(parseProduction(JSON.stringify({ sections: goodSections, storyboard: bad }))).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: FAIL —— `parseProduction` 未导出。

- [ ] **Step 3: 实现 `parseProduction`(追加到 deepseek-script.ts)**

```ts
// 追加到 lib/production/deepseek-script.ts

function nonEmpty(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseProduction(
  raw: string,
): { sections: ScriptSection[]; storyboard: StoryboardShot[] } | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;

  const rawSections = Array.isArray(o.sections) ? o.sections : [];
  if (rawSections.length !== 4) return null;
  const sections: ScriptSection[] = [];
  for (let i = 0; i < 4; i++) {
    const s = rawSections[i] as Record<string, unknown>;
    if (!s || s.id !== REQUIRED_SECTION_IDS[i]) return null;
    const body = nonEmpty(s.body);
    const label = nonEmpty(s.label);
    const duration = nonEmpty(s.duration);
    if (!body || !label || !duration) return null;
    sections.push({ id: REQUIRED_SECTION_IDS[i], label, duration, body });
  }

  const rawShots = Array.isArray(o.storyboard) ? o.storyboard : [];
  if (rawShots.length < 6) return null;
  const storyboard: StoryboardShot[] = [];
  for (let i = 0; i < rawShots.length; i++) {
    const sh = rawShots[i] as Record<string, unknown>;
    if (!sh) return null;
    const time = nonEmpty(sh.time);
    const shot = nonEmpty(sh.shot);
    const voiceOver = nonEmpty(sh.voiceOver);
    const visual = nonEmpty(sh.visual);
    const notes = typeof sh.notes === "string" ? sh.notes : "";
    if (!time || !shot || !voiceOver || !visual) return null;
    storyboard.push({ n: i + 1, time, shot, voiceOver, visual, notes });
  }

  return { sections, storyboard };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: 全 PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/production/deepseek-script.ts tests/production/deepseek-script.test.ts
git commit -m "feat: parseProduction guard for DeepSeek production output"
```

---

## Task 4: `generateProduction`(依赖注入 + 组装完整 ProductionPackage)

**Files:**
- Modify: `lib/production/deepseek-script.ts`
- Test: `tests/production/deepseek-script.test.ts`

- [ ] **Step 1: 追加失败测试**

```ts
// 追加到 tests/production/deepseek-script.test.ts
import { generateProduction } from "@/lib/production/deepseek-script";

describe("generateProduction", () => {
  const okJson = JSON.stringify({ sections: goodSections, storyboard: goodShots });

  it("注入 mock complete → 组装出完整 ProductionPackage", async () => {
    const pkg = await generateProduction({ brief, topicCard: card }, { complete: async () => okJson });
    expect(pkg.script.sections).toHaveLength(4);
    expect(pkg.storyboard).toHaveLength(6);
    expect(pkg.script.targetDuration).toBe("12-15 min"); // 来自 formatLabel
    expect(pkg.script.wordCount).toBeGreaterThan(0);      // 由正文统计
    expect(pkg.task.title).toBe("中国月球计划国际化");      // 来自脚手架
    expect(pkg.task.checklist.length).toBeGreaterThanOrEqual(7);
  });

  it("complete 返回坏 JSON → 抛错", async () => {
    await expect(generateProduction({ brief, topicCard: card }, { complete: async () => "garbage" })).rejects.toThrow();
  });
});
```

(`brief`/`card`/`goodSections`/`goodShots` 已在前面的测试文件中定义,可直接引用。)

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/production/deepseek-script.test.ts`
Expected: FAIL —— `generateProduction` 未导出。

- [ ] **Step 3: 实现 `generateProduction` + deps(追加到 deepseek-script.ts)**

```ts
// 追加到 lib/production/deepseek-script.ts
import type { ProductionPackage } from "@/lib/domain/production";

export interface GenerateDeps {
  complete: (prompt: string) => Promise<string>;
}

function defaultDeps(): GenerateDeps {
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
        max_tokens: 4000,
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}

export async function generateProduction(
  opts: { brief: EditorialBrief; topicCard?: TopicCard | null },
  deps: GenerateDeps = defaultDeps(),
): Promise<ProductionPackage> {
  const topicCard = opts.topicCard ?? null;
  const formatLabel = topicCard?.formatLabel ?? "深度短视频（5-8 min）";
  const raw = await deps.complete(buildScriptPrompt(opts.brief, topicCard));
  const parsed = parseProduction(raw);
  if (!parsed) throw new Error("DeepSeek 生产包解析失败");
  const wordCount = parsed.sections.reduce((sum, s) => sum + s.body.length, 0);
  return {
    script: { targetDuration: deriveTargetDuration(formatLabel), wordCount, sections: parsed.sections },
    storyboard: parsed.storyboard,
    task: buildTaskScaffold(opts.brief, topicCard),
  };
}
```

> 注:`import type { ProductionPackage }` 可与 Task 2 顶部的 `import type { ScriptSection, StoryboardShot }` 合并为一行。`ProductionScript` 不必单独 import(内联对象即可)。

- [ ] **Step 4: 跑测试确认通过 + tsc**

Run: `npx vitest run tests/production/deepseek-script.test.ts && npx tsc --noEmit`
Expected: 全 PASS;tsc 无报错。

- [ ] **Step 5: 提交**

```bash
git add lib/production/deepseek-script.ts tests/production/deepseek-script.test.ts
git commit -m "feat: generateProduction assembles full package from DeepSeek + scaffold"
```

---

## Task 5: `setProductionDraft` 同步 reducer

**Files:**
- Modify: `lib/workflow/local-workflow.ts`(在 `withProductionDraft` 之后、`assertProductionDraftExists` 之前插入)
- Test: `tests/production/local-workflow-production.test.ts`(新建)

- [ ] **Step 1: 写失败测试**

```ts
// tests/production/local-workflow-production.test.ts
import { describe, it, expect } from "vitest";
import { setProductionDraft } from "@/lib/workflow/local-workflow";
import { createInitialWorkflowState } from "@/lib/workflow/local-workflow";
import type { ProductionPackage } from "@/lib/domain/production";

const pkg = {
  script: { targetDuration: "12-15 min", wordCount: 100, sections: [{ id: "hook", label: "x", duration: "0:00", body: "b" }] },
  storyboard: [{ n: 1, time: "0:00-0:08", shot: "s", voiceOver: "v", visual: "vi", notes: "" }],
  task: { title: "t", format: "f", channel: "c", owner: "o", deadline: "d", budget: "b", checklist: [] },
} as ProductionPackage;

describe("setProductionDraft", () => {
  it("把生产包写进指定 briefId,不影响其他 brief", () => {
    const base = createInitialWorkflowState();
    const next = setProductionDraft(base, "b-test", pkg);
    expect(next.productionDrafts["b-test"]).toEqual(pkg);
    expect(next).not.toBe(base); // 不可变
  });
});
```

> `createInitialWorkflowState` 已确认存在(`lib/workflow/local-workflow.ts:131`)。`ProductionPackage` 已从 `@/lib/domain/production` 导出。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/production/local-workflow-production.test.ts`
Expected: FAIL —— `setProductionDraft` 未导出。

- [ ] **Step 3: 实现 reducer(复用现有 `withProductionDraft`)**

```ts
// lib/workflow/local-workflow.ts —— 在 withProductionDraft 函数之后新增:
/** 用外部(LLM)生成的生产包覆盖草稿;现有编辑/重置照常工作。 */
export function setProductionDraft(
  state: LocalWorkflowState,
  briefId: string,
  draft: ProductionPackage,
): LocalWorkflowState {
  return withProductionDraft(state, briefId, draft);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/production/local-workflow-production.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add lib/workflow/local-workflow.ts tests/production/local-workflow-production.test.ts
git commit -m "feat: setProductionDraft reducer for LLM-generated packages"
```

---

## Task 6: `generateProductionAction` server action

**Files:**
- Create: `app/actions/generate-production.ts`

> 该 action 是薄胶水(默认 deps 含网络副作用,不做单测);正确性由 Task 4 引擎单测 + Task 9 端到端覆盖。接收 client 已持有的 brief+topicCard(可序列化),不耦合数据源。

- [ ] **Step 1: 实现 server action**

```ts
// app/actions/generate-production.ts
"use server";

import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import type { ProductionPackage } from "@/lib/domain/production";
import { generateProduction } from "@/lib/production/deepseek-script";

export type GenerateProductionResult =
  | { ok: true; pkg: ProductionPackage }
  | { ok: false; reason: string };

export async function generateProductionAction(input: {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
}): Promise<GenerateProductionResult> {
  try {
    const pkg = await generateProduction({ brief: input.brief, topicCard: input.topicCard });
    return { ok: true, pkg };
  } catch (err) {
    // 脱敏:只回传简短原因,不泄露 key/堆栈
    const reason = err instanceof Error ? err.message : "生成失败";
    return { ok: false, reason };
  }
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 3: 提交**

```bash
git add app/actions/generate-production.ts
git commit -m "feat: generateProductionAction server action (DeepSeek, desensitized errors)"
```

---

## Task 7: 工作室「AI 生成」按钮 + loading 态(presentational)

**Files:**
- Modify: `components/workbench/production-studio.tsx`

- [ ] **Step 1: 在 props 接口加 `onGenerate`**

找到 `interface ProductionStudioProps {`(约第 12 行),新增可选回调:

```ts
  /** 触发 DeepSeek 重新生成脚本+分镜;返回 Promise 以驱动 loading 态。无则不显示该按钮。 */
  onGenerate?: () => Promise<void>;
```

并在解构参数(约第 33-45 行)中加入 `onGenerate,`。

- [ ] **Step 2: 组件内加 loading 状态**

在 `const [tab, setTab] = useState<StudioTab>(initialTab);`(约第 46 行)下方新增:

```tsx
  const [generating, setGenerating] = useState(false);
  const runGenerate = async () => {
    if (!onGenerate || generating) return;
    setGenerating(true);
    onLog("info", `AI 生成中 · ${title}`);
    try {
      await onGenerate();
    } finally {
      setGenerating(false);
    }
  };
```

> `title` 在第 69 行定义于 return 之前,`runGenerate` 引用它无问题(函数体在调用时才求值)。`useState` 已 import;确认顶部 `import { useState, useEffect, useMemo } from "react";` 含 useState(已有)。

- [ ] **Step 3: 在 footer 加按钮(放在「↻ 重新生成」之前)**

在 footer 里 `导出 .md` 按钮之后、`↻ 重新生成` 按钮之前插入:

```tsx
          {onGenerate ? (
            <button
              type="button"
              className="studio-foot-btn primary"
              disabled={generating}
              onClick={runGenerate}
            >
              {generating ? "AI 生成中…" : "✨ AI 生成脚本/分镜"}
            </button>
          ) : null}
```

- [ ] **Step 4: 类型检查 + build**

Run: `npx tsc --noEmit`
Expected: 无报错。

- [ ] **Step 5: 提交**

```bash
git add components/workbench/production-studio.tsx
git commit -m "feat: AI generate button + loading state in production studio"
```

---

## Task 8: 接线 —— provider `generateProduction` + workbench 传 prop(含唯一 collision)

**Files:**
- Modify: `components/workbench/workflow-provider.tsx`(⚠️ 账号层活跃编辑此文件 —— 见 Task 末协调说明)
- Modify: `components/workbench/workbench.tsx`(clean)

- [ ] **Step 1: provider 接口加方法**

在 `WorkbenchStore` 接口的 production 区(约第 82 行 `resetProduction` 之后)新增:

```ts
  generateProduction: (briefId: string) => Promise<void>;
```

- [ ] **Step 2: provider 顶部 import action + reducer**

确认顶部已 import `setProductionDraft`(与其它 `lib/workflow/local-workflow` 导入合并):

```ts
  setProductionDraft,
```

并新增:

```ts
import { generateProductionAction } from "@/app/actions/generate-production";
```

- [ ] **Step 3: 实现 store 方法(在 `resetProduction` 实现之后,约第 385 行)**

```ts
    generateProduction: async (briefId) => {
      const brief = state.editorialBriefs.find((b) => b.id === briefId);
      if (!brief) {
        store.logDemo("warning", `生成失败 · 找不到简报 ${briefId}`, briefId);
        return;
      }
      const topicCard = state.topicCards.find((t) => t.sourceEditorialBriefId === briefId) ?? null;
      const result = await generateProductionAction({ brief, topicCard });
      if (result.ok) {
        setState((current) => setProductionDraft(current, briefId, result.pkg));
        store.logDemo("success", `AI 生成完成 · ${brief.briefTitle}`, briefId);
      } else {
        store.logDemo("warning", `AI 生成失败,已保留模板草稿 · ${result.reason}`, briefId);
      }
    },
```

> 字段名已与代码对齐:简报集合是 **`state.editorialBriefs`**(`workflow-provider.tsx:242`),`state.topicCards` 存在于 `LocalWorkflowState`(`local-workflow.ts:602`)。`store` 为对象字面量(`workflow-provider.tsx:147`),在 async 方法中调用时已完成赋值,故 `store.logDemo` 自引用合法。`state` 是 provider 渲染期快照,在方法中可直接读(既有方法如第 183 行已如此用)。

- [ ] **Step 4: workbench.tsx 传 prop**

在 `<ProductionStudio`(约第 294 行)的 props 末尾、`onReset` 之后新增:

```tsx
          onGenerate={() => store.generateProduction(studioContext.brief.id)}
```

- [ ] **Step 5: 类型检查 + build + 全量测试**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 无报错;测试全绿;build 通过。

- [ ] **Step 6: 提交(分两次,隔离 collision 文件便于合并)**

```bash
git add components/workbench/workbench.tsx
git commit -m "feat: wire onGenerate prop to studio in workbench"
git add components/workbench/workflow-provider.tsx
git commit -m "feat: expose generateProduction action on workflow store"
```

---

## Task 9: 本地端到端验证(真实 DeepSeek,手动)

**Files:** 无代码改动(验证)。

- [ ] **Step 1: 确认 `.env.local` 含 `DEEPSEEK_API_KEY`(主目录 `/Users/fengzhou/Code/LHH/.env.local`)。worktree 若无 .env.local,软链或复制(注意:复制后属于测试残留,记入清理项 C2)。**

- [ ] **Step 2: 起 dev server(用 preview 工具,不要裸 npm)**,打开工作台 → 进入任一 brief 的生产工作室。

- [ ] **Step 3: 点「✨ AI 生成脚本/分镜」**,观察:
  - 按钮变「AI 生成中…」且 disabled;
  - 终端运行日志出现「AI 生成中」→「AI 生成完成」;
  - 脚本 4 段正文被真实内容替换、分镜条数随时长变化(非 stub 的固定 6 条模板话术)。

- [ ] **Step 4: 验证编辑保留**:对生成后的脚本段落二次编辑 → 内容保留;点「↻ 重新生成」→ 回到 stub/fixture(reset 语义不变)。

- [ ] **Step 5: 失败路径**:临时把 `.env.local` 的 `DEEPSEEK_API_KEY` 改错 → 点生成 → 日志出现「AI 生成失败,已保留模板草稿 · …」且原草稿不被破坏。改回 key。

- [ ] **Step 6:** 验证通过后,在 spec/remaining 文档把 A2 标记为完成(单独 docs 提交)。

---

## 协调说明(集成,非代码)
- **唯一 collision = `workflow-provider.tsx`**(账号层活跃编辑)。本计划把它的改动单独成一次提交(Task 8 Step 6),且为 additive(接口加 1 行 + import 1 行 + 方法 1 块)。合并到 phase2 时为 trivial 手解,同 D1 的 package.json 量级。**不在账号层活跃 dirty checkout 上直接改;全部在本 worktree 完成自测后再协调合并。**
- 其余文件全 clean、归我。
- 安全护栏:错误信息脱敏不泄露 key;不在共享活跃 checkout 上动手;只读真库(本任务不写库)。
```
