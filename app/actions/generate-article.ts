"use server";

import type {
  ArticleAudienceRegion,
  ArticleAudienceRole,
  ArticleLang,
  ArticlePlatform,
  ArticleSection,
} from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { generateArticle, regenerateSection, translateSections } from "@/lib/article/deepseek-article";
import { recordUsage } from "@/lib/usage/record";

/** 当前空间/用户，用于把 token 成本归属到正确的空间(缺省则落 null)。 */
type UsageScope = {
  spaceId?: string | null;
  userId?: string | null;
};

type Base = {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  platform: ArticlePlatform;
  audienceRole: ArticleAudienceRole;
  audienceRegion: ArticleAudienceRegion;
} & UsageScope;

export type ArticleActionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const fail = (e: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: e instanceof Error ? e.message : "生成失败",
});

export async function generateArticleAction(input: Base): Promise<ArticleActionResult<ArticleSection[]>> {
  try {
    const v = await generateArticle(input, (e) => void recordUsage({ ...e, operation: "article", spaceId: input.spaceId, userId: input.userId }));
    return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}

export async function regenerateArticleSectionAction(
  input: Base & { section: ArticleSection },
): Promise<ArticleActionResult<string>> {
  try {
    const v = await regenerateSection(input, input.section, (e) => void recordUsage({ ...e, operation: "article", spaceId: input.spaceId, userId: input.userId }));
    return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}

export async function translateArticleAction(input: {
  sections: ArticleSection[];
  lang: ArticleLang;
} & UsageScope): Promise<ArticleActionResult<ArticleSection[]>> {
  try {
    const v = await translateSections(input.sections, input.lang, (e) => void recordUsage({ ...e, operation: "article", spaceId: input.spaceId, userId: input.userId }));
    return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}

export async function retranslateSectionAction(input: {
  section: ArticleSection;
  lang: ArticleLang;
} & UsageScope): Promise<ArticleActionResult<string>> {
  try {
    const v = await translateSections([input.section], input.lang, (e) => void recordUsage({ ...e, operation: "article", spaceId: input.spaceId, userId: input.userId }));
    return v?.[0]?.body ? { ok: true, value: v[0].body } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}
