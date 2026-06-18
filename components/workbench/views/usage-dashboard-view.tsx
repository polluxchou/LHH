"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n/copy";
import { useCopy } from "@/lib/i18n/locale-context";
import { useSpaceSession } from "@/components/account/space-provider";
import type { UsageDashboardData } from "@/lib/usage/dashboard";

const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
const fmtInt = (n: number) => n.toLocaleString("en-US");

export function UsageDashboardView({
  locale,
  data,
  renderedSpaceId,
}: {
  locale: Locale;
  data: UsageDashboardData;
  renderedSpaceId: string;
}) {
  void locale;
  const t = useCopy();
  const tu = t.views.usage;
  const s = useSpaceSession();
  const router = useRouter();

  // page 取的是 cookie 解析出的 renderedSpaceId 的数据。用户用空间切换器(仅写 cookie +
  // 客户端状态)切换后,重跑 server component 以拉取新空间的数据。
  useEffect(() => {
    if (s.currentSpaceId && s.currentSpaceId !== renderedSpaceId) router.refresh();
  }, [s.currentSpaceId, renderedSpaceId, router]);

  const { totals, byProviderModel, bySpace } = data;
  const empty = totals.calls === 0;
  const scopeLabel = data.scope.kind === "owner" ? tu.scopeOwner : tu.scopeSpace;

  return (
    <div className="vv">
      <header className="vv-head">
        <div className="vv-head-left">
          <div className="vv-kicker">{tu.kicker}</div>
          <h2 className="vv-title">{tu.title}</h2>
          <div className="vv-sub">{scopeLabel} · {tu.allTime}</div>
        </div>
      </header>

      <div className="vv-body">
        {empty ? (
          <div className="vv-empty">
            <div className="vv-empty-glyph">📊</div>
            <div className="vv-empty-title">{tu.emptyTitle}</div>
            <div className="vv-empty-sub">{tu.emptySub}</div>
          </div>
        ) : (
          <>
            <div className="usage-cards">
              <div className="usage-card">
                <div className="usage-card-label">{tu.cardCost}</div>
                <div className="usage-card-value">{fmtUsd(totals.totalCostUsd)}</div>
              </div>
              <div className="usage-card">
                <div className="usage-card-label">{tu.cardTokens}</div>
                <div className="usage-card-value">{fmtInt(totals.totalTokens)}</div>
              </div>
              <div className="usage-card">
                <div className="usage-card-label">{tu.cardCalls}</div>
                <div className="usage-card-value">{fmtInt(totals.calls)}</div>
              </div>
            </div>

            {bySpace ? (
              <section className="usage-section">
                <h3 className="usage-section-title">{tu.bySpaceTitle}</h3>
                <div className="vv-table usage-space-table">
                  <div className="vv-row vv-head-row">
                    <span>{tu.colSpace}</span>
                    <span>{tu.colCost}</span>
                    <span>{tu.colTokens}</span>
                    <span>{tu.colCalls}</span>
                  </div>
                  {bySpace.map((r) => (
                    <div className="vv-row" key={r.spaceId}>
                      <span>{r.spaceName}</span>
                      <span>{fmtUsd(r.costUsd)}</span>
                      <span>{fmtInt(r.tokens)}</span>
                      <span>{fmtInt(r.calls)}</span>
                    </div>
                  ))}
                  <div className="vv-row usage-total-row">
                    <span>{tu.totalRow}</span>
                    <span>{fmtUsd(totals.totalCostUsd)}</span>
                    <span>{fmtInt(totals.totalTokens)}</span>
                    <span>{fmtInt(totals.calls)}</span>
                  </div>
                </div>
              </section>
            ) : null}

            <section className="usage-section">
              <h3 className="usage-section-title">{tu.byModelTitle}</h3>
              <div className="vv-table usage-model-table">
                <div className="vv-row vv-head-row">
                  <span>{tu.colProvider}</span>
                  <span>{tu.colModel}</span>
                  <span>{tu.colCost}</span>
                  <span>{tu.colTokens}</span>
                  <span>{tu.colCalls}</span>
                </div>
                {byProviderModel.map((r) => (
                  <div className="vv-row" key={`${r.provider}|${r.model}`}>
                    <span>{r.provider}</span>
                    <span>{r.model}</span>
                    <span>{fmtUsd(r.costUsd)}</span>
                    <span>{fmtInt(r.tokens)}</span>
                    <span>{fmtInt(r.calls)}</span>
                  </div>
                ))}
              </div>
            </section>

            {totals.hasUnpricedRows ? <p className="usage-note">{tu.unpricedNote}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}
