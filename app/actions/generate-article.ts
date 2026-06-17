"use server";

import type { ArticleLang, ArticlePlatform, ArticleSection, ArticleType } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { generateArticle, regenerateSection, translateSections } from "@/lib/article/deepseek-article";

type Base = {
  brief: EditorialBrief;
  topicCard: TopicCard | null;
  type: ArticleType;
  platform: ArticlePlatform;
  audience: string;
};

export type ArticleActionResult<T> = { ok: true; value: T } | { ok: false; reason: string };

const fail = (e: unknown): { ok: false; reason: string } => ({
  ok: false,
  reason: e instanceof Error ? e.message : "生成失败",
});

export async function generateArticleAction(input: Base): Promise<ArticleActionResult<ArticleSection[]>> {
  try {
    const v = await generateArticle(input);
    return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}

export async function regenerateArticleSectionAction(
  input: Base & { section: ArticleSection },
): Promise<ArticleActionResult<string>> {
  try {
    const v = await regenerateSection(input, input.section);
    return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}

export async function translateArticleAction(input: {
  sections: ArticleSection[];
  lang: ArticleLang;
}): Promise<ArticleActionResult<ArticleSection[]>> {
  try {
    const v = await translateSections(input.sections, input.lang);
    return v ? { ok: true, value: v } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}

export async function retranslateSectionAction(input: {
  section: ArticleSection;
  lang: ArticleLang;
}): Promise<ArticleActionResult<string>> {
  try {
    const v = await translateSections([input.section], input.lang);
    return v?.[0]?.body ? { ok: true, value: v[0].body } : { ok: false, reason: "AI 未返回有效结果" };
  } catch (e) {
    return fail(e);
  }
}
