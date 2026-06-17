# 生成文章（Article Studio）· 设计

> 2026-06-16 · 选题池「生成文章」从占位升级为三步向导，交互/样式参考「生成视频」（ProductionStudio）。

## 目标

在选题池卡片点「生成文章」，打开一个**三步向导弹窗**，把一条选题（简报 + 选题卡）生成为可发布的图文/文案，并翻译为多语种。复用「生成视频」那套弹窗壳与编辑/重生成交互。

三步：
1. **配置**：选发布类型 + 平台 + 受众描述
2. **生成内容**：DeepSeek 生成分段正文，可逐段二次生成、可编辑
3. **翻译**：用户多选目标语言，逐语言生成译文；译文可编辑、可逐段重译

## 已定取舍（brainstorm 结论）

- 翻译目标语：**用户手动多选**（不按平台自动推断）。
- 「图文贴」类型：**只生成正文文案**，不做配图说明、不生成真图。
- 内容/翻译生成：**实时调 DeepSeek + 失败回退模板**（与简报/视频一致）。
- 草稿：**客户端态**（仿 `productionDrafts`，刷新重置），不持久化到 DB。
- 样式：复用 `.studio-*` 弹窗壳，仅少量新增 `.article-*`。

## 入口与开闭

- 选题池卡片「生成文章」按钮（`TopicPoolPanel` 的 `onGenerateArticle`，现仅记日志）→ 改为打开 `ArticleStudio`。
- 开闭状态在 `Workbench` 本地 `useState`（`articleStudio: { topicCardId: string } | null`），与现有 `studio` 同构。
- 草稿数据在 `WorkflowProvider`（见下），跨开闭保留。

## 数据模型（`lib/domain/article.ts`）

```ts
export type ArticleType = "short" | "article" | "image_text";        // 短讯 / 文章 / 图文贴
export type ArticlePlatform =
  | "xiaohongshu" | "linkedin" | "moments" | "x" | "website" | "sms"; // 小红书/领英/朋友圈/X/公司官网/短信

export interface ArticleSection {
  id: string;        // 稳定 id（段标识），译文与源段以同 id 对应
  label: string;     // 段标签（如 开头/正文/结尾，或平台化小标题）
  body: string;
}

export interface ArticleTranslation {
  lang: string;                 // "en" | "ja" | "ko" | "ru" | ...
  sections: ArticleSection[];   // 与源 sections 同 id 一一对应；可编辑、可逐段重译
}

export interface ArticleDraft {
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;             // 受众描述（自由文本）
  sections: ArticleSection[];   // 步骤二：源语（中文）内容
  translations: ArticleTranslation[]; // 步骤三：各目标语版本
}
```

- 存储：`LocalWorkflowState.articleDrafts: Record<string, ArticleDraft>`，**key = topicCard.id**。

## 步骤交互

**步骤一 · 配置**
- 类型：3 个单选 chip（短讯/文章/图文贴）。
- 平台：6 个单选 chip（小红书/领英/朋友圈/X/公司官网/短信）。
- 受众：textarea。
- 底栏「生成」→ 触发 `generateArticle`，进入步骤二（loading）。

**步骤二 · 生成内容**
- 渲染 `sections` 为可编辑 textarea（参考 `ScriptPanel`）。
- 每段一个 ↻「二次生成」按钮 → `regenerateArticleSection`（仅重写该段，带该段 loading）。
- 底栏「重新生成全部」+「下一步：翻译」。
- 失败 → 回退模板草稿并记 warning。

**步骤三 · 翻译**
- 一组目标语言 chip（多选）：英文/日文/韩文/俄文/西语…（固定小清单，见下）。
- 「翻译选中语言」→ 对每个已选语言调 `translateArticle`，产出 `translations[lang]`（与源段同 id）。
- 每个语言版本：分段可编辑 textarea + 每段 ↻「重新翻译该段」（`retranslateArticleSection`）。
- 已生成的语言用小标签分组展示/切换。
- 底栏「完成」关闭。

语言清单（初版固定）：`en 英文 / ja 日文 / ko 韩文 / ru 俄文 / es 西语 / fr 法语`（源语中文不在目标列表）。

## Server Actions（`app/actions/generate-article.ts`，`"use server"`）

均返回 `{ ok: true; ... } | { ok: false; reason: string }`，失败由调用方回退/提示：

- `generateArticleAction({ brief, topicCard, type, platform, audience }) → { sections: ArticleSection[] }`
- `regenerateArticleSectionAction({ brief, topicCard, type, platform, audience, section }) → { body: string }`
- `translateArticleAction({ sections, targetLang, type, platform }) → { sections: ArticleSection[] }`
- `retranslateArticleSectionAction({ section, targetLang }) → { body: string }`

## AI 实现（`lib/article/deepseek-article.ts`，仿 `lib/production/deepseek-script.ts`）

- `buildArticlePrompt` / `buildTranslatePrompt`：依据 type（长度语气）、platform（风格/格式约定）、audience 拼提示词；要求 DeepSeek 只输出 JSON。
- `parseArticle` / `parseSections`：解析 + 校验（空则判失败）。
- `defaultDeps`：OpenAI SDK → `https://api.deepseek.com`（同 brief/script，用 `DEEPSEEK_API_KEY`）。
- 失败/无 key → 抛错，由 action 捕获返回 `{ok:false}`。
- 模板兜底 `lib/article/stub-article.ts`（仿 `stub-production.ts`）：无 AI 时也能出确定性草稿，保证流程可走通。

## Provider（`workflow-provider.tsx`）

- 状态：`articleDrafts`、`generatingArticleIds`/`translatingKeys`（loading 态，仿 `generatingBriefIds`/`runningIds`）。
- 异步 action：`generateArticle`、`regenerateArticleSection`、`translateArticle`、`retranslateArticleSection`（都 await server action，成功写 reducer，失败回退+日志）。
- 同步 reducer（`local-workflow.ts` 或新 `lib/workflow/article-draft.ts`）：`setArticleDraft`、`editArticleSection`、`editArticleTranslationSection`、`upsertTranslation`、`setTranslationSection`。

## 组件

- `components/workbench/article-studio.tsx`：弹窗（复用 `.studio-backdrop/.studio/.studio-head/.studio-foot`），顶部步骤指示器替代 tab，三个步骤面板。
- `Workbench`：渲染 `<ArticleStudio>`、接 `onGenerateArticle` 打开。

## 样式（`app/globals.css`）

复用 `.studio-*`；新增少量：`.article-steps`（① ② ③ 指示器）、`.article-opt`（类型/平台 chip 组）、`.article-lang`（语言多选 chip）、`.article-trans-group`（译文分组）。

## i18n（`lib/i18n/copy.ts`）

新增 `articleStudio` namespace（zh/en，键集一致、en 无 CJK）：步骤名、类型/平台/语言标签、按钮、loading、空态、日志模板。

## 测试

- `lib/article/deepseek-article` 的 `parse*` + `stub-article`：确定性单测（解析、容错、兜底非空）。
- 文章草稿 reducer：编辑/重译段落的纯函数单测。
- Server action 极薄，不单测网络。

## YAGNI（明确不做）

- 图文贴的配图说明 / 真图生成 / 图像 API。
- 草稿持久化到 Supabase。
- 翻译语言的自动推断（改为手动多选）。
- 文章「送交负责人 / 导出」之外的发布对接（仅 UI/日志占位）。

## 协作

「生成文章」此前由「LHH - UI」会话标记为其负责；本设计经用户改派本会话实现，开工前向「LHH - UI」发接管通知，避免重复实现。
