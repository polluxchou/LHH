import type {
  ArticleAudienceRegion,
  ArticleAudienceRole,
  ArticleLang,
  ArticlePlatform,
  ArticleSection,
  PlatformForm,
} from "@/lib/domain/article";
import { PLATFORM_LIMITS } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";

interface StubArgs {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  platform: ArticlePlatform;
  audienceRole: ArticleAudienceRole;
  audienceRegion: ArticleAudienceRegion;
}

/** 段落骨架按平台形态（短/标准/长）伸缩。 */
const SKELETON: Record<PlatformForm, { id: string; label: string }[]> = {
  short: [
    { id: "lead", label: "一句话要点" },
    { id: "body", label: "正文" },
  ],
  standard: [
    { id: "hook", label: "开头钩子" },
    { id: "body", label: "正文" },
    { id: "cta", label: "互动引导" },
  ],
  long: [
    { id: "lead", label: "导语" },
    { id: "background", label: "背景" },
    { id: "core", label: "核心" },
    { id: "impact", label: "意义" },
    { id: "close", label: "结语" },
  ],
};

const PLATFORM_WORD: Record<ArticlePlatform, string> = {
  weibo: "微博",
  linkedin_article: "领英文章",
  linkedin_post: "领英动态",
  wechat_mp: "公众号",
  xiaohongshu: "小红书",
  email: "邮件",
  im: "即时消息",
  meeting_summary: "会议总结",
};

const ROLE_WORD: Record<ArticleAudienceRole, string> = {
  buyer: "采购商",
  distributor: "经销商",
  manufacturer: "生产商",
};

const REGION_WORD: Record<ArticleAudienceRegion, string> = {
  domestic: "国内",
  asia: "海外·亚洲",
  europe: "海外·欧洲",
  africa: "海外·非洲",
  oceania: "海外·大洋洲",
  north_america: "海外·北美洲",
};

/** 无 AI / AI 失败时的确定性草稿，保证流程可走通（不臆造，标注「草稿」）。 */
export function buildArticleStub(args: StubArgs): ArticleSection[] {
  const { brief, topicCard, platform, audienceRole, audienceRegion } = args;
  const title = topicCard?.workingTitle ?? brief.briefTitle;
  const facts = brief.factBullets ?? [brief.factSummary];
  const form = PLATFORM_LIMITS[platform].form;
  const who = `${REGION_WORD[audienceRegion]}${ROLE_WORD[audienceRole]}`;
  return SKELETON[form].map((s, i) => ({
    id: s.id,
    label: s.label,
    body: `（草稿）${title} · ${s.label}：${facts[i % facts.length] ?? brief.whyItMatters}。编辑可在此覆写为面向「${who}」的${PLATFORM_WORD[platform]}文案。`,
  }));
}

/** 无 AI / 翻译失败时的占位译文（保持 id，前缀语言标记）。 */
export function buildTranslateStub(sections: ArticleSection[], lang: ArticleLang): ArticleSection[] {
  return sections.map((s) => ({ ...s, body: `[${lang}] ${s.body}` }));
}
