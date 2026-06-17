// 发布平台（决定文风、长度、版式期望）。
export type ArticlePlatform =
  | "weibo" // 新浪微博
  | "linkedin_article" // 领英文章
  | "linkedin_post" // 领英动态
  | "wechat_mp" // 微信公众号推文
  | "xiaohongshu" // 小红书图文
  | "email" // 邮件
  | "im" // Whatsapp / 短信 / Telegram 消息
  | "meeting_summary"; // 会议总结

// 受众角色（单选）。
export type ArticleAudienceRole = "buyer" | "distributor" | "manufacturer"; // 采购商 / 经销商 / 生产商

// 受众区域（单选）。
export type ArticleAudienceRegion =
  | "domestic" // 国内
  | "asia" // 海外·亚洲
  | "europe" // 海外·欧洲
  | "africa" // 海外·非洲
  | "oceania" // 海外·大洋洲
  | "north_america"; // 海外·北美洲

/** 目标翻译语言（源语为中文，不在此列） */
export type ArticleLang = "en" | "ja" | "ko" | "ru" | "es" | "fr";

export interface ArticleSection {
  id: string;
  label: string;
  body: string;
}

export interface ArticleTranslation {
  lang: ArticleLang;
  /** 与源 sections 同 id 一一对应 */
  sections: ArticleSection[];
}

export interface ArticleDraft {
  platform: ArticlePlatform;
  audienceRole: ArticleAudienceRole;
  audienceRegion: ArticleAudienceRegion;
  sections: ArticleSection[];
  translations: ArticleTranslation[];
}

export const ARTICLE_PLATFORMS: ArticlePlatform[] = [
  "weibo",
  "linkedin_article",
  "linkedin_post",
  "wechat_mp",
  "xiaohongshu",
  "email",
  "im",
  "meeting_summary",
];

export const ARTICLE_AUDIENCE_ROLES: ArticleAudienceRole[] = ["buyer", "distributor", "manufacturer"];

export const ARTICLE_AUDIENCE_REGIONS: ArticleAudienceRegion[] = [
  "domestic",
  "asia",
  "europe",
  "africa",
  "oceania",
  "north_america",
];

export const ARTICLE_LANGS: ArticleLang[] = ["en", "ja", "ko", "ru", "es", "fr"];

/** 平台形态：决定生成正文的段落骨架/长度。 */
export type PlatformForm = "short" | "standard" | "long";

/** 每平台的硬性字数限制（写进 DeepSeek prompt，并在 UI 提示框展示）。 */
export interface PlatformLimit {
  form: PlatformForm;
  /** 标题字数上限（含 emoji 与标点）；无标题概念时省略 */
  titleMax?: number;
  /** 正文字数上限 */
  bodyMax?: number;
  /** 正文最佳字数 */
  bodyBest?: number;
}

export const PLATFORM_LIMITS: Record<ArticlePlatform, PlatformLimit> = {
  weibo: { form: "short", bodyMax: 2000, bodyBest: 140 },
  linkedin_article: { form: "long", titleMax: 100, bodyMax: 3000 },
  linkedin_post: { form: "standard", bodyMax: 3000, bodyBest: 1300 },
  wechat_mp: { form: "long", titleMax: 64, bodyMax: 1500, bodyBest: 1200 },
  xiaohongshu: { form: "standard", titleMax: 20, bodyMax: 1000 },
  email: { form: "standard", titleMax: 60, bodyMax: 1200 },
  im: { form: "short", bodyMax: 500 },
  meeting_summary: { form: "long", bodyMax: 2000 },
};
