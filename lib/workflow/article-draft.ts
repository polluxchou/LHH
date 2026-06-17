import type { ArticleDraft, ArticleTranslation } from "@/lib/domain/article";
import type { LocalWorkflowState } from "@/lib/workflow/local-workflow";

const put = (s: LocalWorkflowState, key: string, d: ArticleDraft): LocalWorkflowState => ({
  ...s,
  articleDrafts: { ...s.articleDrafts, [key]: d },
});

export function setArticleDraft(s: LocalWorkflowState, key: string, draft: ArticleDraft): LocalWorkflowState {
  return put(s, key, draft);
}

export function editArticleSection(s: LocalWorkflowState, key: string, id: string, body: string): LocalWorkflowState {
  const d = s.articleDrafts[key];
  if (!d) return s;
  return put(s, key, { ...d, sections: d.sections.map((x) => (x.id === id ? { ...x, body } : x)) });
}

/** AI 段落重生成结果写回（与 editArticleSection 同义，语义更明确） */
export function setArticleSectionBody(s: LocalWorkflowState, key: string, id: string, body: string): LocalWorkflowState {
  return editArticleSection(s, key, id, body);
}

export function upsertTranslation(s: LocalWorkflowState, key: string, tr: ArticleTranslation): LocalWorkflowState {
  const d = s.articleDrafts[key];
  if (!d) return s;
  const rest = d.translations.filter((t) => t.lang !== tr.lang);
  return put(s, key, { ...d, translations: [...rest, tr] });
}

export function editTranslationSection(
  s: LocalWorkflowState,
  key: string,
  lang: string,
  id: string,
  body: string,
): LocalWorkflowState {
  const d = s.articleDrafts[key];
  if (!d) return s;
  return put(s, key, {
    ...d,
    translations: d.translations.map((t) =>
      t.lang === lang ? { ...t, sections: t.sections.map((x) => (x.id === id ? { ...x, body } : x)) } : t,
    ),
  });
}
