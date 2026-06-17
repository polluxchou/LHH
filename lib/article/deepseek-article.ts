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
    `【事实要点】`,
    ...facts.map((f) => `- ${f}`),
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
  try {
    o = JSON.parse(match[0]);
  } catch {
    return null;
  }
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

export async function regenerateSection(
  a: GenArgs,
  section: ArticleSection,
  deps: ArticleDeps = defaultDeps(),
): Promise<string | null> {
  const secs = parseSections(await deps.complete(buildSectionRegenPrompt(a, section)));
  return secs?.find((s) => s.id === section.id)?.body ?? secs?.[0]?.body ?? null;
}

export async function translateSections(
  sections: ArticleSection[],
  lang: ArticleLang,
  deps: ArticleDeps = defaultDeps(),
): Promise<ArticleSection[] | null> {
  return parseSections(await deps.complete(buildTranslatePrompt(sections, lang)));
}
