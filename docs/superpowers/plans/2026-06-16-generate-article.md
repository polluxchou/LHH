# 生成文章（Article Studio）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 选题池「生成文章」从占位升级为三步向导弹窗（配置→生成内容→翻译），用 DeepSeek 实时生成分段正文，可逐段二次生成/编辑；再多选语言翻译，译文可编辑/逐段重译。

**Architecture:** 复用「生成视频」(ProductionStudio) 的 `.studio-*` 弹窗壳与「段落编辑 + ↻ 重生成」交互；逻辑分层与视频一致：domain 类型 → AI(deepseek-article)+模板兜底(stub-article) → server actions → 客户端草稿态(articleDrafts)+reducer → provider 异步 action → 组件。草稿客户端态、刷新重置。

**Tech Stack:** Next.js 15 / React 19 / TypeScript / Server Actions / OpenAI SDK→DeepSeek / vitest / i18n(useCopy) / Supabase 不涉及。

参考 spec：`docs/superpowers/specs/2026-06-16-generate-article-design.md`。

---

### Task 1: 领域类型

**Files:**
- Create: `lib/domain/article.ts`

- [ ] **Step 1: 写类型文件**

```ts
export type ArticleType = "short" | "article" | "image_text"; // 短讯 / 文章 / 图文贴
export type ArticlePlatform =
  | "xiaohongshu" | "linkedin" | "moments" | "x" | "website" | "sms";

/** 目标翻译语言（源语为中文，不在此列） */
export type ArticleLang = "en" | "ja" | "ko" | "ru" | "es" | "fr";

export interface ArticleSection {
  id: string;
  label: string;
  body: string;
}

export interface ArticleTranslation {
  lang: ArticleLang;
  sections: ArticleSection[]; // 与源 sections 同 id 一一对应
}

export interface ArticleDraft {
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;
  sections: ArticleSection[];
  translations: ArticleTranslation[];
}

export const ARTICLE_TYPES: ArticleType[] = ["short", "article", "image_text"];
export const ARTICLE_PLATFORMS: ArticlePlatform[] = [
  "xiaohongshu", "linkedin", "moments", "x", "website", "sms",
];
export const ARTICLE_LANGS: ArticleLang[] = ["en", "ja", "ko", "ru", "es", "fr"];
```

- [ ] **Step 2: 校验编译** — Run: `npx tsc --noEmit` Expected: PASS
- [ ] **Step 3: 提交** — `git add lib/domain/article.ts && git commit -m "feat(article): domain types for Article Studio"`

---

### Task 2: 模板兜底 stub-article（确定性，TDD）

无 AI / AI 失败时也能出可走通流程的草稿。

**Files:**
- Create: `lib/article/stub-article.ts`
- Test: `tests/article/stub-article.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { buildArticleStub, buildTranslateStub } from "@/lib/article/stub-article";
import type { EditorialBrief } from "@/lib/domain/types";

const brief = {
  id: "b1", briefTitle: "飞沃科技收购西安创航", factSummary: "事实摘要正文",
  whyItMatters: "为什么重要正文", factBullets: ["要点一", "要点二"],
} as unknown as EditorialBrief;

describe("buildArticleStub", () => {
  it("returns non-empty sections with stable ids", () => {
    const secs = buildArticleStub({ brief, topicCard: null, type: "article", platform: "linkedin", audience: "行业采购" });
    expect(secs.length).toBeGreaterThan(0);
    expect(secs.every((s) => s.id && s.label && s.body)).toBe(true);
  });
  it("short type is more compact than article", () => {
    const a = buildArticleStub({ brief, topicCard: null, type: "article", platform: "website", audience: "" });
    const s = buildArticleStub({ brief, topicCard: null, type: "short", platform: "sms", audience: "" });
    expect(s.length).toBeLessThanOrEqual(a.length);
  });
});

describe("buildTranslateStub", () => {
  it("keeps same ids, prefixes lang marker", () => {
    const src = [{ id: "lead", label: "导语", body: "正文" }];
    const out = buildTranslateStub(src, "en");
    expect(out.map((s) => s.id)).toEqual(["lead"]);
    expect(out[0].body).toContain("[en]");
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npx vitest run tests/article/stub-article.test.ts` Expected: FAIL（模块不存在）
- [ ] **Step 3: 实现**

```ts
import type { ArticleLang, ArticlePlatform, ArticleSection, ArticleType } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

interface StubArgs {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;
}

/** 不同类型的段落骨架（label 列表）。短讯最短，文章最长，图文贴居中。 */
const SKELETON: Record<ArticleType, { id: string; label: string }[]> = {
  short: [{ id: "lead", label: "一句话要点" }, { id: "body", label: "正文" }],
  image_text: [
    { id: "hook", label: "开头钩子" }, { id: "body", label: "正文" }, { id: "cta", label: "互动引导" },
  ],
  article: [
    { id: "lead", label: "导语" }, { id: "background", label: "背景" },
    { id: "core", label: "核心" }, { id: "impact", label: "意义" }, { id: "close", label: "结语" },
  ],
};

export function buildArticleStub(args: StubArgs): ArticleSection[] {
  const { brief, topicCard, type } = args;
  const title = topicCard?.workingTitle ?? brief.briefTitle;
  const facts = brief.factBullets ?? [brief.factSummary];
  return SKELETON[type].map((s, i) => ({
    id: s.id,
    label: s.label,
    body: `（草稿）${title} · ${s.label}：${facts[i % facts.length] ?? brief.whyItMatters}。编辑可在此覆写为面向「${args.audience || "目标读者"}」的${platformWord(args.platform)}文案。`,
  }));
}

export function buildTranslateStub(sections: ArticleSection[], lang: ArticleLang): ArticleSection[] {
  return sections.map((s) => ({ ...s, body: `[${lang}] ${s.body}` }));
}

function platformWord(p: ArticlePlatform): string {
  const map: Record<ArticlePlatform, string> = {
    xiaohongshu: "小红书", linkedin: "领英", moments: "朋友圈", x: "X", website: "官网", sms: "短信",
  };
  return map[p];
}
```

- [ ] **Step 4: 跑测试通过** — Run: `npx vitest run tests/article/stub-article.test.ts` Expected: PASS
- [ ] **Step 5: 提交** — `git add lib/article/stub-article.ts tests/article/stub-article.test.ts && git commit -m "feat(article): deterministic stub fallback"`

---

### Task 3: DeepSeek 生成/翻译（deepseek-article，TDD parse）

仿 `lib/ingest/deepseek-analyze.ts` / `lib/production/deepseek-script.ts`：prompt 构造 + JSON 解析 + 依赖注入（`complete`）+ defaultDeps(OpenAI→deepseek)。

**Files:**
- Create: `lib/article/deepseek-article.ts`
- Test: `tests/article/deepseek-article.test.ts`

- [ ] **Step 1: 写失败测试（只测纯函数：prompt 含关键约束 + parse 容错）**

```ts
import { describe, it, expect } from "vitest";
import { buildArticlePrompt, buildTranslatePrompt, parseSections } from "@/lib/article/deepseek-article";
import type { EditorialBrief } from "@/lib/domain/types";

const brief = { id: "b1", briefTitle: "T", factSummary: "F", whyItMatters: "W", factBullets: ["a"] } as unknown as EditorialBrief;

describe("buildArticlePrompt", () => {
  it("includes type/platform/audience and demands JSON", () => {
    const p = buildArticlePrompt({ brief, topicCard: null, type: "short", platform: "xiaohongshu", audience: "新手妈妈" });
    expect(p).toContain("小红书");
    expect(p).toContain("新手妈妈");
    expect(p.toLowerCase()).toContain("json");
  });
});

describe("parseSections", () => {
  it("parses a sections JSON (with code fence)", () => {
    const out = parseSections('```json\n{"sections":[{"id":"lead","label":"导语","body":"正文"}]}\n```');
    expect(out).toEqual([{ id: "lead", label: "导语", body: "正文" }]);
  });
  it("returns null on garbage / empty", () => {
    expect(parseSections("nope")).toBeNull();
    expect(parseSections('{"sections":[]}')).toBeNull();
  });
});

describe("buildTranslatePrompt", () => {
  it("names the target language and forbids extra output", () => {
    const p = buildTranslatePrompt([{ id: "lead", label: "导语", body: "正文" }], "en");
    expect(p.toLowerCase()).toContain("json");
    expect(p).toContain("en");
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npx vitest run tests/article/deepseek-article.test.ts` Expected: FAIL
- [ ] **Step 3: 实现**

```ts
import OpenAI from "openai";
import type { ArticleLang, ArticlePlatform, ArticleSection, ArticleType } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

const TYPE_HINT: Record<ArticleType, string> = {
  short: "短讯：1-2 段、≤120 字、信息密度高、可直接群发。",
  article: "深度文章：4-6 段、有导语/背景/核心/意义/结语，逻辑完整。",
  image_text: "社媒图文贴：3 段左右、开头有钩子、口语化、结尾有互动引导。",
};
const PLATFORM_HINT: Record<ArticlePlatform, string> = {
  xiaohongshu: "小红书：标题党+emoji、口语种草、短句、可加话题标签。",
  linkedin: "领英：专业、第一人称、行业视角、克制。",
  moments: "朋友圈：极短、个人化、一句话观点+转发理由。",
  x: "X/推特：≤280 字、有观点、可加 hashtag。",
  website: "公司官网：正式、第三人称、结构清晰。",
  sms: "短信：≤70 字、一句话通知、含关键信息。",
};

interface GenArgs {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;
}

export function buildArticlePrompt(a: GenArgs): string {
  const facts = a.brief.factBullets ?? [a.brief.factSummary];
  const title = a.topicCard?.workingTitle ?? a.brief.briefTitle;
  return [
    `你是"林哈哈聊太空"的内容编辑。基于下面这条简报，为指定平台与受众撰写可发布的文案。`,
    `【选题】${title}`,
    `【事实要点】`, ...facts.map((f) => `- ${f}`),
    `【为什么重要】${a.brief.whyItMatters}`,
    `【发布类型】${TYPE_HINT[a.type]}`,
    `【平台】${PLATFORM_HINT[a.platform]}`,
    `【目标受众】${a.audience || "未指定，按平台默认受众"}`,
    `只输出一个 JSON 对象（不要解释、不要 markdown 代码块）：`,
    `{"sections":[{"id":"lead","label":"段标题","body":"该段中文正文"}]}`,
    `要求：分段合理、每段 id 唯一且语义稳定、body 为中文可直接发布、贴合平台风格与受众。只输出 json。`,
  ].join("\n");
}

export function buildSectionRegenPrompt(a: GenArgs, section: ArticleSection): string {
  return [
    buildArticlePrompt(a),
    ``,
    `现在只重写其中这一段（保持同一 id="${section.id}"、同一段定位「${section.label}」），给出更好的版本。`,
    `当前内容：${section.body}`,
    `只输出 JSON：{"sections":[{"id":"${section.id}","label":"${section.label}","body":"新的中文正文"}]}`,
  ].join("\n");
}

export function buildTranslatePrompt(sections: ArticleSection[], lang: ArticleLang): string {
  return [
    `把下面的中文文案翻译成目标语言（lang code: ${lang}），保持分段与每段 id 不变，语气自然、符合该语言母语表达。`,
    `输入：${JSON.stringify({ sections })}`,
    `只输出 JSON：{"sections":[{"id":"...","label":"...","body":"译文"}]}。label 也翻译。只输出 json。`,
  ].join("\n");
}

export function parseSections(jsonText: string): ArticleSection[] | null {
  const match = jsonText.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let o: unknown;
  try { o = JSON.parse(match[0]); } catch { return null; }
  const arr = (o as { sections?: unknown })?.sections;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const out: ArticleSection[] = [];
  for (const r of arr) {
    const x = (r ?? {}) as Record<string, unknown>;
    const id = String(x.id ?? "").trim();
    const label = String(x.label ?? "").trim();
    const body = String(x.body ?? "").trim();
    if (!id || !body) return null;
    out.push({ id, label: label || id, body });
  }
  return out;
}

export interface ArticleDeps {
  complete: (prompt: string) => Promise<string>;
}

function defaultDeps(): ArticleDeps {
  const client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: "https://api.deepseek.com" });
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

export async function generateArticle(a: GenArgs, deps: ArticleDeps = defaultDeps()): Promise<ArticleSection[] | null> {
  return parseSections(await deps.complete(buildArticlePrompt(a)));
}
export async function regenerateSection(a: GenArgs, section: ArticleSection, deps: ArticleDeps = defaultDeps()): Promise<string | null> {
  const secs = parseSections(await deps.complete(buildSectionRegenPrompt(a, section)));
  return secs?.find((s) => s.id === section.id)?.body ?? secs?.[0]?.body ?? null;
}
export async function translateSections(sections: ArticleSection[], lang: ArticleLang, deps: ArticleDeps = defaultDeps()): Promise<ArticleSection[] | null> {
  return parseSections(await deps.complete(buildTranslatePrompt(sections, lang)));
}
```

- [ ] **Step 4: 跑测试通过** — Run: `npx vitest run tests/article/deepseek-article.test.ts` Expected: PASS
- [ ] **Step 5: 提交** — `git add lib/article/deepseek-article.ts tests/article/deepseek-article.test.ts && git commit -m "feat(article): DeepSeek generate/translate + parse"`

---

### Task 4: Server Actions

**Files:**
- Create: `app/actions/generate-article.ts`

- [ ] **Step 1: 写文件**

```ts
"use server";

import type { ArticleLang, ArticlePlatform, ArticleSection, ArticleType } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { generateArticle, regenerateSection, translateSections } from "@/lib/article/deepseek-article";

type Base = { brief: EditorialBrief; topicCard: TopicCard | null; type: ArticleType; platform: ArticlePlatform; audience: string };
type R<T> = { ok: true; value: T } | { ok: false; reason: string };
const fail = (e: unknown): { ok: false; reason: string } => ({ ok: false, reason: e instanceof Error ? e.message : "生成失败" });

export async function generateArticleAction(input: Base): Promise<R<ArticleSection[]>> {
  try { const v = await generateArticle(input); return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" }; }
  catch (e) { return fail(e); }
}
export async function regenerateArticleSectionAction(input: Base & { section: ArticleSection }): Promise<R<string>> {
  try { const v = await regenerateSection(input, input.section); return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" }; }
  catch (e) { return fail(e); }
}
export async function translateArticleAction(input: { sections: ArticleSection[]; lang: ArticleLang }): Promise<R<ArticleSection[]>> {
  try { const v = await translateSections(input.sections, input.lang); return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" }; }
  catch (e) { return fail(e); }
}
export async function retranslateSectionAction(input: { section: ArticleSection; lang: ArticleLang }): Promise<R<string>> {
  try { const v = await translateSections([input.section], input.lang); return v?.[0]?.body ? { ok: true, value: v[0].body } : { ok: false, reason: "AI 未返回有效结果" }; }
  catch (e) { return fail(e); }
}
```

- [ ] **Step 2: 校验编译** — Run: `npx tsc --noEmit` Expected: PASS
- [ ] **Step 3: 提交** — `git add app/actions/generate-article.ts && git commit -m "feat(article): server actions (generate/regen/translate/retranslate)"`

---

### Task 5: 草稿态 + reducer（TDD）

**Files:**
- Modify: `lib/workflow/local-workflow.ts`（`LocalWorkflowState` 加 `articleDrafts: Record<string, ArticleDraft>`；`createInitialWorkflowState()` 加 `articleDrafts: {}`；import `ArticleDraft`）
- Create: `lib/workflow/article-draft.ts`（纯 reducer）
- Test: `tests/article/article-draft.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import {
  setArticleDraft, editArticleSection, upsertTranslation, editTranslationSection,
} from "@/lib/workflow/article-draft";
import { createInitialWorkflowState } from "@/lib/workflow/local-workflow";
import type { ArticleDraft } from "@/lib/domain/article";

const draft: ArticleDraft = {
  type: "article", platform: "linkedin", audience: "x",
  sections: [{ id: "lead", label: "导语", body: "中文" }], translations: [],
};

describe("article-draft reducers", () => {
  it("set then edit source section", () => {
    let st = setArticleDraft(createInitialWorkflowState(), "t1", draft);
    expect(st.articleDrafts["t1"].sections[0].body).toBe("中文");
    st = editArticleSection(st, "t1", "lead", "改后");
    expect(st.articleDrafts["t1"].sections[0].body).toBe("改后");
  });
  it("upsert translation then edit a translated section", () => {
    let st = setArticleDraft(createInitialWorkflowState(), "t1", draft);
    st = upsertTranslation(st, "t1", { lang: "en", sections: [{ id: "lead", label: "Lead", body: "EN" }] });
    expect(st.articleDrafts["t1"].translations[0].lang).toBe("en");
    st = editTranslationSection(st, "t1", "en", "lead", "EN2");
    expect(st.articleDrafts["t1"].translations[0].sections[0].body).toBe("EN2");
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — Run: `npx vitest run tests/article/article-draft.test.ts` Expected: FAIL
- [ ] **Step 3: 实现 reducer**

```ts
// lib/workflow/article-draft.ts
import type { ArticleDraft, ArticleTranslation } from "@/lib/domain/article";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";

const put = (s: LocalWorkflowState, key: string, d: ArticleDraft): LocalWorkflowState =>
  ({ ...s, articleDrafts: { ...s.articleDrafts, [key]: d } });

export function setArticleDraft(s: LocalWorkflowState, key: string, draft: ArticleDraft): LocalWorkflowState {
  return put(s, key, draft);
}
export function editArticleSection(s: LocalWorkflowState, key: string, id: string, body: string): LocalWorkflowState {
  const d = s.articleDrafts[key]; if (!d) return s;
  return put(s, key, { ...d, sections: d.sections.map((x) => (x.id === id ? { ...x, body } : x)) });
}
export function setArticleSectionBody(s: LocalWorkflowState, key: string, id: string, body: string): LocalWorkflowState {
  return editArticleSection(s, key, id, body); // 别名：AI 重生成结果应用
}
export function upsertTranslation(s: LocalWorkflowState, key: string, tr: ArticleTranslation): LocalWorkflowState {
  const d = s.articleDrafts[key]; if (!d) return s;
  const rest = d.translations.filter((t) => t.lang !== tr.lang);
  return put(s, key, { ...d, translations: [...rest, tr] });
}
export function editTranslationSection(s: LocalWorkflowState, key: string, lang: string, id: string, body: string): LocalWorkflowState {
  const d = s.articleDrafts[key]; if (!d) return s;
  return put(s, key, {
    ...d,
    translations: d.translations.map((t) =>
      t.lang === lang ? { ...t, sections: t.sections.map((x) => (x.id === id ? { ...x, body } : x)) } : t,
    ),
  });
}
```

- [ ] **Step 4: 加 state 字段** — `local-workflow.ts`：`import type { ArticleDraft } from "@/lib/domain/article";`，`LocalWorkflowState` 加 `articleDrafts: Record<string, ArticleDraft>;`，`createInitialWorkflowState()` 返回对象加 `articleDrafts: {},`。其余构建 state 的地方（buildSpaceState/seedSpaceContent 若显式列字段）也补 `articleDrafts: {}`。
- [ ] **Step 5: 跑测试通过 + tsc** — Run: `npx vitest run tests/article/article-draft.test.ts && npx tsc --noEmit` Expected: PASS
- [ ] **Step 6: 提交** — `git add lib/workflow/article-draft.ts lib/workflow/local-workflow.ts tests/article/article-draft.test.ts && git commit -m "feat(article): client draft state + reducers"`

---

### Task 6: i18n 文案（articleStudio namespace）

**Files:**
- Modify: `lib/i18n/copy.ts`（en 与 zh 两处各加 `articleStudio`，键集一致、en 无 CJK）

- [ ] **Step 1: 加 zh `articleStudio`**（放在合适 namespace 层级，参考 `studio`）

```ts
articleStudio: {
  kicker: "生成文章", title: "生成文章 · 三步",
  stepConfig: "配置", stepContent: "生成内容", stepTranslate: "翻译",
  typeLabel: "发布类型", platformLabel: "平台", audienceLabel: "受众",
  audiencePlaceholder: "描述目标受众，如：行业采购、关注供应链的工厂主…",
  type: { short: "短讯", article: "文章", image_text: "图文贴" },
  platform: { xiaohongshu: "小红书", linkedin: "领英", moments: "朋友圈", x: "X", website: "公司官网", sms: "短信" },
  lang: { en: "英文", ja: "日文", ko: "韩文", ru: "俄文", es: "西语", fr: "法语" },
  generate: "生成", generating: "AI 生成中…", regenAll: "重新生成全部",
  next: "下一步：翻译", back: "上一步",
  regenSection: "二次生成本段", retranslateSection: "重新翻译本段",
  pickLangs: "选择要翻译的语言（可多选）", translate: "翻译选中语言", translating: "翻译中…",
  done: "完成", sectionRegenLog: (l: string) => `二次生成 · ${l}`,
  emptyContent: "点「生成」让 AI 基于这条选题写正文。",
  emptyTranslate: "先在上一步生成正文，再选语言翻译。",
  genFailLog: (r: string) => `AI 生成失败，已用模板草稿 · ${r}`,
},
```

- [ ] **Step 2: 加 en `articleStudio`**（同键、英文、无 CJK）

```ts
articleStudio: {
  kicker: "Generate article", title: "Generate article · 3 steps",
  stepConfig: "Configure", stepContent: "Generate", stepTranslate: "Translate",
  typeLabel: "Type", platformLabel: "Platform", audienceLabel: "Audience",
  audiencePlaceholder: "Describe the target audience, e.g. industrial buyers, supply-chain factory owners…",
  type: { short: "Short", article: "Article", image_text: "Image post" },
  platform: { xiaohongshu: "Xiaohongshu", linkedin: "LinkedIn", moments: "Moments", x: "X", website: "Website", sms: "SMS" },
  lang: { en: "English", ja: "Japanese", ko: "Korean", ru: "Russian", es: "Spanish", fr: "French" },
  generate: "Generate", generating: "Generating…", regenAll: "Regenerate all",
  next: "Next: translate", back: "Back",
  regenSection: "Regenerate section", retranslateSection: "Re-translate section",
  pickLangs: "Pick target languages (multi-select)", translate: "Translate selected", translating: "Translating…",
  done: "Done", sectionRegenLog: (l: string) => `Regenerated · ${l}`,
  emptyContent: "Click Generate to draft from this topic.",
  emptyTranslate: "Generate the body first, then pick languages.",
  genFailLog: (r: string) => `AI failed, kept template draft · ${r}`,
},
```

- [ ] **Step 3: 校验 i18n 测试 + tsc** — Run: `npx vitest run tests/unit/i18n.test.ts && npx tsc --noEmit` Expected: PASS（en/zh 键集一致）
- [ ] **Step 4: 提交** — `git add lib/i18n/copy.ts && git commit -m "i18n(article): articleStudio namespace (zh/en)"`

---

### Task 7: Provider 异步 action + loading

**Files:**
- Modify: `components/workbench/workflow-provider.tsx`

接口（加到 `WorkbenchStore`）：
```ts
articleDrafts: Record<string, ArticleDraft>;
generatingArticleKeys: ReadonlySet<string>;                 // key=topicCardId（整篇生成/翻译 loading）
busyArticleSectionKeys: ReadonlySet<string>;                // key=`${topicCardId}:${sectionId}` 或 `:${lang}:${sectionId}`
generateArticle: (topicCardId: string, cfg: { type: ArticleType; platform: ArticlePlatform; audience: string }) => Promise<void>;
regenerateArticleSection: (topicCardId: string, sectionId: string) => Promise<void>;
translateArticleLangs: (topicCardId: string, langs: ArticleLang[]) => Promise<void>;
retranslateArticleSection: (topicCardId: string, lang: ArticleLang, sectionId: string) => Promise<void>;
editArticleSectionBody: (topicCardId: string, sectionId: string, body: string) => void;
editArticleTranslationBody: (topicCardId: string, lang: ArticleLang, sectionId: string, body: string) => void;
```

- [ ] **Step 1: 实现**（参考 `generateBrief`/`generateProduction` 的 async+loading+回退；每个 action：解析 topicCard→brief（`state.topicCards.find(id)` → `state.editorialBriefs.find(sourceEditorialBriefId)`），调对应 server action，成功用 reducer 写入、失败回退 stub 并 `logDemo("warning", articleStudio.genFailLog(reason))`。整篇生成/翻译用 `generatingArticleKeys`，单段用 `busyArticleSectionKeys`，`finally` 必清。`editArticle*Body` 走同步 reducer。）
  - `generateArticle`：成功→`setArticleDraft(key,{type,platform,audience,sections:value,translations:[]})`；失败→`setArticleDraft(key,{...,sections:buildArticleStub(...)})`。
  - `regenerateArticleSection`：成功→`setArticleSectionBody`；失败→logDemo warning（不改动）。
  - `translateArticleLangs`：对每个 lang 调 `translateArticleAction`，成功→`upsertTranslation`；失败→该 lang 用 `buildTranslateStub` upsert + warning。
  - `retranslateArticleSection`：成功→`editTranslationSection`；失败→warning。
- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit` Expected: PASS
- [ ] **Step 3: 提交** — `git add components/workbench/workflow-provider.tsx && git commit -m "feat(article): provider async actions + loading"`

---

### Task 8: ArticleStudio 组件（三步向导弹窗）

**Files:**
- Create: `components/workbench/article-studio.tsx`

复用 `.studio-backdrop/.studio/.studio-head/.studio-foot`；顶部用步骤指示器（`.article-steps` 三个 `.article-step`，active 高亮）替代 tab。Props：
```ts
interface ArticleStudioProps {
  brief: EditorialBrief; topicCard: TopicCard;
  draft: ArticleDraft | null;        // store.articleDrafts[topicCard.id]
  generating: boolean;               // store.generatingArticleKeys.has(id)
  isSectionBusy: (key: string) => boolean;
  onClose: () => void;
  onGenerate: (cfg) => Promise<void> | void;          // → store.generateArticle
  onRegenSection: (sectionId) => void;
  onEditSection: (sectionId, body) => void;
  onTranslate: (langs) => void;
  onRetranslateSection: (lang, sectionId) => void;
  onEditTranslation: (lang, sectionId, body) => void;
}
```
- 本地 `step: 1|2|3`、step1 表单态（type/platform/audience，初值取 draft 或默认 `article`/`linkedin`/""）、step3 选中语言集。
- step1：类型/平台 chip（`.article-opt-chip`）+ audience textarea；底栏「生成」→ `onGenerate` 后 `setStep(2)`。
- step2：`draft.sections` map 成可编辑 textarea + 每段 ↻（`onRegenSection`，busy 时禁用/转圈）；底栏「重新生成全部」+「下一步」。
- step3：语言多选 chip（`ARTICLE_LANGS`）+「翻译选中语言」；每个 `draft.translations` 分组渲染（语言标签 + 可编辑 textarea + 每段 ↻ `onRetranslateSection`）。底栏「完成」。
- Esc 关闭（仿 ProductionStudio useEffect）。文案全部走 `useCopy().articleStudio`。

- [ ] **Step 1: 写组件**（按上结构；参考 production-studio.tsx 的弹窗壳/段落编辑/loading 按钮写法）
- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit` Expected: PASS
- [ ] **Step 3: 提交** — `git add components/workbench/article-studio.tsx && git commit -m "feat(article): ArticleStudio 3-step wizard component"`

---

### Task 9: 接入选题池 + workbench

**Files:**
- Modify: `components/workbench/workbench.tsx`（加 `articleStudio` 开闭态 + 渲染 `<ArticleStudio>` + `onGenerateArticle` 改为开弹窗）
- 注：`topic-pool-panel.tsx` 的 `onGenerateArticle(topicCardId)` 已存在，无需改签名。

- [ ] **Step 1: 实现**
  - `const [articleStudio, setArticleStudio] = useState<{ topicCardId: string } | null>(null);`
  - `onGenerateArticle={(topicCardId) => setArticleStudio({ topicCardId })}`（替换原来只 logDemo 的实现）
  - 末尾渲染：解析 `topicCard = state.topicCards.find(id)`、`brief = state.editorialBriefs.find(b.id===topicCard.sourceEditorialBriefId)`；都在才渲染 `<ArticleStudio ...>`，props 接 `store.articleDrafts[id]`、`store.generatingArticleKeys.has(id)`、`(k)=>store.busyArticleSectionKeys.has(k)`、各 `store.*` action（用 topicCardId 绑定）。`onClose={() => setArticleStudio(null)}`。
- [ ] **Step 2: tsc** — Run: `npx tsc --noEmit` Expected: PASS
- [ ] **Step 3: 提交** — `git add components/workbench/workbench.tsx && git commit -m "feat(article): wire ArticleStudio into pool card + workbench"`

---

### Task 10: 样式（.article-*）

**Files:**
- Modify: `app/globals.css`（追加，复用 studio 变量/配色）

- [ ] **Step 1: 加样式**：`.article-steps`（flex 三段，连接线）、`.article-step`(+`.active`/`.done`)、`.article-opt`（chip 组）、`.article-opt-chip`(+`.on`)、`.article-lang-chip`(+`.on`)、`.article-trans-group`（语言分组卡）、复用 `.script-section/.sec-body/.sec-regen` 的可借用就借用。保证弹窗在 760px 以下可用（参考既有 `@media`）。
- [ ] **Step 2: 提交** — `git add app/globals.css && git commit -m "style(article): ArticleStudio steps/chips/translation groups"`

---

### Task 11: 全量验证

- [ ] **Step 1:** Run: `npx tsc --noEmit` Expected: PASS
- [ ] **Step 2:** Run: `npx vitest run` Expected: all PASS（含新增 article 测试 + i18n 键集校验）
- [ ] **Step 3:** Run: `npx next build` Expected: 构建成功
- [ ] **Step 4: 提交（若有未提交）+ push** — `git push origin main`（触发 Vercel 部署）

---

## Self-Review 备注（执行者注意）
- 草稿 key 统一用 **topicCard.id**（贯穿 provider/component/workbench）。
- AI 失败一律**回退确定性 stub**、记 warning、不阻断流程（与简报/视频一致）。
- DeepSeek key（`DEEPSEEK_API_KEY`）服务端已配（摄取/简报在用）；无 key 时走 stub。
- 仅 UI chrome 文案进 copy.ts；演示/业务文案不进字典。
- 每个 Task 结束即提交；Task 11 才 push（按发布规范 push→Vercel 自动部署）。
