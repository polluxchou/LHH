import type { ArticleLang, ArticlePlatform, ArticleSection, ArticleType } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

interface StubArgs {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;
}

/** 不同类型的段落骨架。短讯最短，文章最长，图文贴居中。 */
const SKELETON: Record<ArticleType, { id: string; label: string }[]> = {
  short: [
    { id: "lead", label: "一句话要点" },
    { id: "body", label: "正文" },
  ],
  image_text: [
    { id: "hook", label: "开头钩子" },
    { id: "body", label: "正文" },
    { id: "cta", label: "互动引导" },
  ],
  article: [
    { id: "lead", label: "导语" },
    { id: "background", label: "背景" },
    { id: "core", label: "核心" },
    { id: "impact", label: "意义" },
    { id: "close", label: "结语" },
  ],
};

const PLATFORM_WORD: Record<ArticlePlatform, string> = {
  xiaohongshu: "小红书",
  linkedin: "领英",
  moments: "朋友圈",
  x: "X",
  website: "官网",
  sms: "短信",
};

/** 无 AI / AI 失败时的确定性草稿，保证流程可走通（不臆造，标注「草稿」）。 */
export function buildArticleStub(args: StubArgs): ArticleSection[] {
  const { brief, topicCard, type, platform, audience } = args;
  const title = topicCard?.workingTitle ?? brief.briefTitle;
  const facts = brief.factBullets ?? [brief.factSummary];
  return SKELETON[type].map((s, i) => ({
    id: s.id,
    label: s.label,
    body: `（草稿）${title} · ${s.label}：${facts[i % facts.length] ?? brief.whyItMatters}。编辑可在此覆写为面向「${audience || "目标读者"}」的${PLATFORM_WORD[platform]}文案。`,
  }));
}

/** 无 AI / 翻译失败时的占位译文（保持 id，前缀语言标记）。 */
export function buildTranslateStub(sections: ArticleSection[], lang: ArticleLang): ArticleSection[] {
  return sections.map((s) => ({ ...s, body: `[${lang}] ${s.body}` }));
}
