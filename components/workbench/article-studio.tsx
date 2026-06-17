"use client";

import { useEffect, useState } from "react";
import type {
  ArticleDraft,
  ArticleLang,
  ArticlePlatform,
  ArticleType,
} from "@/lib/domain/article";
import { ARTICLE_LANGS, ARTICLE_PLATFORMS, ARTICLE_TYPES } from "@/lib/domain/article";
import type { EditorialBrief, TopicCard } from "@/lib/domain/types";
import { useCopy } from "@/lib/i18n/locale-context";

interface ArticleStudioProps {
  brief: EditorialBrief;
  topicCard: TopicCard;
  draft: ArticleDraft | null;
  /** 整篇生成/翻译 loading */
  generating: boolean;
  /** 源段 ↻ 是否在生成 */
  isSectionBusy: (sectionId: string) => boolean;
  /** 译文段 ↻ 是否在重译 */
  isTransBusy: (lang: ArticleLang, sectionId: string) => boolean;
  onClose: () => void;
  onGenerate: (cfg: { type: ArticleType; platform: ArticlePlatform; audience: string }) => void;
  onRegenSection: (sectionId: string) => void;
  onEditSection: (sectionId: string, body: string) => void;
  onTranslate: (langs: ArticleLang[]) => void;
  onRetranslateSection: (lang: ArticleLang, sectionId: string) => void;
  onEditTranslation: (lang: ArticleLang, sectionId: string, body: string) => void;
}

export function ArticleStudio({
  brief,
  topicCard,
  draft,
  generating,
  isSectionBusy,
  isTransBusy,
  onClose,
  onGenerate,
  onRegenSection,
  onEditSection,
  onTranslate,
  onRetranslateSection,
  onEditTranslation,
}: ArticleStudioProps) {
  const a = useCopy().articleStudio;
  const hasContent = Boolean(draft && draft.sections.length > 0);

  const [step, setStep] = useState<1 | 2 | 3>(hasContent ? 2 : 1);
  const [type, setType] = useState<ArticleType>(draft?.type ?? "article");
  const [platform, setPlatform] = useState<ArticlePlatform>(draft?.platform ?? "linkedin");
  const [audience, setAudience] = useState(draft?.audience ?? "");
  const [langs, setLangs] = useState<ReadonlySet<ArticleLang>>(() => new Set());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = topicCard.workingTitle || brief.briefTitle;
  const STEPS: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: a.stepConfig },
    { n: 2, label: a.stepContent },
    { n: 3, label: a.stepTranslate },
  ];

  const toggleLang = (l: ArticleLang) =>
    setLangs((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });

  const runGenerate = () => {
    onGenerate({ type, platform, audience });
    setStep(2);
  };

  return (
    <div className="studio-backdrop" onClick={onClose}>
      <div className="studio article-studio" onClick={(event) => event.stopPropagation()}>
        <header className="studio-head">
          <div className="studio-head-left">
            <div className="studio-kicker">{a.kicker}</div>
            <h2 className="studio-title">{title}</h2>
          </div>
          <div className="studio-head-right">
            <button type="button" className="studio-close" onClick={onClose} aria-label={a.done}>
              ×
            </button>
          </div>
        </header>

        <nav className="article-steps">
          {STEPS.map((s) => {
            const reachable = s.n === 1 || hasContent;
            return (
              <button
                key={s.n}
                type="button"
                className={`article-step ${step === s.n ? "active" : ""} ${step > s.n ? "done" : ""}`}
                disabled={!reachable}
                onClick={() => reachable && setStep(s.n)}
              >
                <span className="article-step-n">{s.n}</span>
                <span className="article-step-l">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="studio-body article-body">
          {step === 1 ? (
            <div className="article-config">
              <div className="article-field">
                <span className="article-field-l">{a.typeLabel}</span>
                <div className="article-opt">
                  {ARTICLE_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`article-opt-chip ${type === t ? "on" : ""}`}
                      onClick={() => setType(t)}
                    >
                      {a.type[t]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="article-field">
                <span className="article-field-l">{a.platformLabel}</span>
                <div className="article-opt">
                  {ARTICLE_PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`article-opt-chip ${platform === p ? "on" : ""}`}
                      onClick={() => setPlatform(p)}
                    >
                      {a.platform[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="article-field">
                <span className="article-field-l">{a.audienceLabel}</span>
                <textarea
                  className="at-textarea"
                  rows={3}
                  placeholder={a.audiencePlaceholder}
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            !hasContent ? (
              <div className="article-empty">{a.emptyContent}</div>
            ) : (
              <div className="article-sections">
                {draft!.sections.map((sec) => (
                  <section key={sec.id} className="article-section">
                    <header>
                      <span className="article-sec-l">{sec.label}</span>
                      <button
                        type="button"
                        className="sec-regen"
                        title={a.regenSection}
                        disabled={isSectionBusy(sec.id)}
                        onClick={() => onRegenSection(sec.id)}
                      >
                        {isSectionBusy(sec.id) ? "…" : "↻"}
                      </button>
                    </header>
                    <textarea
                      className="sec-body"
                      value={sec.body}
                      rows={Math.max(3, Math.ceil(sec.body.length / 36) + 1)}
                      onChange={(event) => onEditSection(sec.id, event.target.value)}
                    />
                  </section>
                ))}
              </div>
            )
          ) : null}

          {step === 3 ? (
            !hasContent ? (
              <div className="article-empty">{a.emptyTranslate}</div>
            ) : (
              <div className="article-translate">
                <div className="article-langpick">
                  <span className="article-field-l">{a.pickLangs}</span>
                  <div className="article-opt">
                    {ARTICLE_LANGS.map((l) => (
                      <button
                        key={l}
                        type="button"
                        className={`article-lang-chip ${langs.has(l) ? "on" : ""}`}
                        onClick={() => toggleLang(l)}
                      >
                        {a.lang[l]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="studio-foot-btn primary"
                    disabled={generating || langs.size === 0}
                    onClick={() => onTranslate([...langs])}
                  >
                    {generating ? a.translating : a.translate}
                  </button>
                </div>

                {draft!.translations.map((tr) => (
                  <div key={tr.lang} className="article-trans-group">
                    <div className="article-trans-lang">{a.lang[tr.lang]}</div>
                    {tr.sections.map((sec) => (
                      <section key={sec.id} className="article-section">
                        <header>
                          <span className="article-sec-l">{sec.label}</span>
                          <button
                            type="button"
                            className="sec-regen"
                            title={a.retranslateSection}
                            disabled={isTransBusy(tr.lang, sec.id)}
                            onClick={() => onRetranslateSection(tr.lang, sec.id)}
                          >
                            {isTransBusy(tr.lang, sec.id) ? "…" : "↻"}
                          </button>
                        </header>
                        <textarea
                          className="sec-body"
                          value={sec.body}
                          rows={Math.max(3, Math.ceil(sec.body.length / 36) + 1)}
                          onChange={(event) => onEditTranslation(tr.lang, sec.id, event.target.value)}
                        />
                      </section>
                    ))}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </main>

        <footer className="studio-foot">
          <span className="studio-foot-spacer" />
          {step > 1 ? (
            <button type="button" className="studio-foot-btn ghost" onClick={() => setStep((s) => (s === 3 ? 2 : 1))}>
              {a.back}
            </button>
          ) : null}
          {step === 1 ? (
            <button type="button" className="studio-foot-btn primary" disabled={generating} onClick={runGenerate}>
              {generating ? a.generating : a.generate}
            </button>
          ) : null}
          {step === 2 ? (
            <>
              <button
                type="button"
                className="studio-foot-btn ghost"
                disabled={generating}
                onClick={() => onGenerate({ type, platform, audience })}
              >
                {generating ? a.generating : a.regenAll}
              </button>
              <button type="button" className="studio-foot-btn primary" disabled={!hasContent} onClick={() => setStep(3)}>
                {a.next}
              </button>
            </>
          ) : null}
          {step === 3 ? (
            <button type="button" className="studio-foot-btn primary" onClick={onClose}>
              {a.done}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
