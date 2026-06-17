export type ArticleType = "short" | "article" | "image_text"; // 短讯 / 文章 / 图文贴
export type ArticlePlatform =
  | "xiaohongshu"
  | "linkedin"
  | "moments"
  | "x"
  | "website"
  | "sms";

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
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;
  sections: ArticleSection[];
  translations: ArticleTranslation[];
}

export const ARTICLE_TYPES: ArticleType[] = ["short", "article", "image_text"];
export const ARTICLE_PLATFORMS: ArticlePlatform[] = [
  "xiaohongshu",
  "linkedin",
  "moments",
  "x",
  "website",
  "sms",
];
export const ARTICLE_LANGS: ArticleLang[] = ["en", "ja", "ko", "ru", "es", "fr"];
