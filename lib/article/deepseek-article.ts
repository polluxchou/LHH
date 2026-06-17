import OpenAI from "openai";
import type {
  ArticleAudienceRegion,
  ArticleAudienceRole,
  ArticleLang,
  ArticlePlatform,
  ArticleSection,
} from "@/lib/domain/article";
import { PLATFORM_LIMITS } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { extractOpenAIUsage, type TokenUsage, type UsageSink } from "@/lib/usage/extract";

const ARTICLE_MODEL = "deepseek-v4-flash";

const PLATFORM_HINT: Record<ArticlePlatform, string> = {
  weibo: "新浪微博：短平快、有观点、口语化、可加话题#标签#。",
  linkedin_article: "领英文章：专业长文、第一人称、行业视角、结构完整。",
  linkedin_post: "领英动态：专业但简短、第一人称、一个观点+引导讨论。",
  wechat_mp: "微信公众号推文：有标题、有小标题分段、可读性强、适度专业。",
  xiaohongshu: "小红书图文：标题党+emoji、口语种草、短句、结尾话题标签。",
  email: "邮件：有主题行、称呼、正文、落款，正式而清晰。",
  im: "即时消息（Whatsapp/短信/Telegram）：极短、一句话直达、含关键信息与下一步。",
  meeting_summary: "会议总结：结构化要点、决议、待办，第三人称、客观。",
};

const ROLE_HINT: Record<ArticleAudienceRole, string> = {
  buyer: "采购商：关注供货能力、价格、交期、质量与合规。",
  distributor: "经销商：关注渠道政策、利润空间、市场前景与支持。",
  manufacturer: "生产商：关注产能、工艺、原材料、技术与产业链。",
};

const REGION_HINT: Record<ArticleAudienceRegion, string> = {
  domestic: "国内读者：中文语境、本土表达。",
  asia: "海外·亚洲读者：留意区域市场差异。",
  europe: "海外·欧洲读者：重合规、专业、克制。",
  africa: "海外·非洲读者：重性价比与可得性。",
  oceania: "海外·大洋洲读者。",
  north_america: "海外·北美读者：直接、数据驱动。",
};

interface GenArgs {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  platform: ArticlePlatform;
  audienceRole: ArticleAudienceRole;
  audienceRegion: ArticleAudienceRegion;
}

/** 把平台的硬性字数限制拼成中文约束句（写进 prompt；超出会被要求压缩重写）。 */
export function platformLimitClause(platform: ArticlePlatform): string {
  const lim = PLATFORM_LIMITS[platform];
  const parts: string[] = [];
  if (lim.titleMax) parts.push(`标题（含 emoji 与标点）≤ ${lim.titleMax} 字`);
  if (lim.bodyMax) parts.push(`正文 ≤ ${lim.bodyMax} 字${lim.bodyBest ? `（${lim.bodyBest} 字内最佳）` : ""}`);
  return parts.length ? `【硬性字数限制】${parts.join("；")}。超出会被强制压缩重写，请务必在限制内。` : "";
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
    `【平台】${PLATFORM_HINT[a.platform]}`,
    `【受众角色】${ROLE_HINT[a.audienceRole]}`,
    `【受众区域】${REGION_HINT[a.audienceRegion]}`,
    platformLimitClause(a.platform),
    `只输出一个 JSON 对象（不要解释、不要 markdown 代码块）：`,
    `{"sections":[{"id":"lead","label":"段标题","body":"该段中文正文"}]}`,
    `要求：分段合理、每段 id 唯一且语义稳定、body 为中文可直接发布、贴合平台风格与受众、不超字数限制。只输出 json。`,
  ]
    .filter(Boolean)
    .join("\n");
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
