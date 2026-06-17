import { describe, it, expect } from "vitest";
import {
  setArticleDraft,
  editArticleSection,
  upsertTranslation,
  editTranslationSection,
} from "@/lib/workflow/article-draft";
import { createInitialWorkflowState } from "@/lib/workflow/local-workflow";
import type { ArticleDraft } from "@/lib/domain/article";

const draft: ArticleDraft = {
  type: "article",
  platform: "linkedin",
  audience: "x",
  sections: [{ id: "lead", label: "导语", body: "中文" }],
  translations: [],
};

describe("article-draft reducers", () => {
  it("set then edit source section", () => {
    let st = setArticleDraft(createInitialWorkflowState(), "t1", draft);
    expect(st.articleDrafts["t1"].sections[0].body).toBe("中文");
    st = editArticleSection(st, "t1", "lead", "改后");
    expect(st.articleDrafts["t1"].sections[0].body).toBe("改后");
  });

  it("upsert translation then edit a translated section", () => {
    let st = setArticleDraft(createInitialWorkflowState(), "t1", draft);
    st = upsertTranslation(st, "t1", { lang: "en", sections: [{ id: "lead", label: "Lead", body: "EN" }] });
    expect(st.articleDrafts["t1"].translations[0].lang).toBe("en");
    st = editTranslationSection(st, "t1", "en", "lead", "EN2");
    expect(st.articleDrafts["t1"].translations[0].sections[0].body).toBe("EN2");
  });

  it("upsert is idempotent per lang (replaces, no dup)", () => {
    let st = setArticleDraft(createInitialWorkflowState(), "t1", draft);
    st = upsertTranslation(st, "t1", { lang: "en", sections: [{ id: "lead", label: "L", body: "v1" }] });
    st = upsertTranslation(st, "t1", { lang: "en", sections: [{ id: "lead", label: "L", body: "v2" }] });
    expect(st.articleDrafts["t1"].translations).toHaveLength(1);
    expect(st.articleDrafts["t1"].translations[0].sections[0].body).toBe("v2");
  });
});
