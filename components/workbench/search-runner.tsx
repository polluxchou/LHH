"use client";

import type { TrackingObject } from "@/lib/domain/types";
import { useCopy } from "@/lib/i18n/locale-context";

export type RunnerStateKind = "idle" | "run" | "ok" | "err";

export interface RunnerViewModel {
  state: RunnerStateKind;
  queries: number;
  hits: number;
  signals: number;
  dedup: number;
  lastRun: string;
  failReason: string;
}

interface SearchRunnerProps {
  tracked: TrackingObject;
  runner: RunnerViewModel;
  onRun: () => void;
  onFail: () => void;
  onDemoAction: (message: string) => void;
}

export function SearchRunner({ tracked, runner, onRun, onFail, onDemoAction }: SearchRunnerProps) {
  const t = useCopy();
  const r = t.workbench.runner;
  const failed = runner.state === "err";
  const displayName = tracked.name;
  const secondaryName = tracked.nameZh && tracked.nameZh !== tracked.name ? tracked.nameZh : "";

  return (
    <div className={`runner ${failed ? "failed" : ""}`}>
      <div className="runner-top">
        <div className="runner-target">
          <div className="label">{r.targetLabel}</div>
          <div className="name">
            {displayName}
            <span className="cn">{secondaryName}</span>
          </div>
        </div>
        <div className="runner-actions">
          <button type="button" className="btn-run" onClick={onRun} disabled={runner.state === "run"}>
            <span className="ic"></span>
            {runner.state === "run" ? r.searching : r.runDaily}
          </button>
          <button type="button" className="btn-fail" onClick={onFail} disabled={runner.state === "run"}>
            {r.simulateFail}
          </button>
        </div>
      </div>

      <div className="runner-stats">
        <div className="stat">
          <div className={`v ${runner.state === "run" ? "warn" : failed ? "danger" : ""}`}>{runner.queries}</div>
          <div className="l">{r.statQueries}</div>
        </div>
        <div className="stat">
          <div className={`v ${failed ? "danger" : ""}`}>{runner.hits}</div>
          <div className="l">{r.statHits}</div>
        </div>
        <div className="stat">
          <div className="v ok">{runner.signals}</div>
          <div className="l">{r.statSignals}</div>
        </div>
        <div className="stat">
          <div className={`v ${runner.dedup > 0 ? "warn" : ""}`}>{runner.dedup}</div>
          <div className="l">{r.statDedup}</div>
        </div>
      </div>

      <div className="runner-state">
        <span className={`dot ${runner.state}`}></span>
        {runner.state === "idle" ? <span>{r.ready(runner.lastRun)}</span> : null}
        {runner.state === "run" ? <span>{r.running}</span> : null}
        {runner.state === "ok" ? <span>{r.ok(runner.lastRun, runner.signals, runner.dedup)}</span> : null}
        {runner.state === "err" ? <span>{r.err(runner.lastRun, runner.failReason)}</span> : null}
      </div>

      {failed ? (
        <div className="fail-panel">
          <div className="title">{r.failTitle}</div>
          <ul>
            <li>{r.failLine1}</li>
            <li>{r.failLine2}</li>
            <li>{r.failLine3}</li>
            <li>{r.failLine4}</li>
          </ul>
          <div className="actions">
            <button type="button" className="brief-action" onClick={onRun}>
              {r.retry}
            </button>
            <button type="button" className="brief-action" onClick={() => onDemoAction(r.demoUseCache)}>
              {r.useCache}
            </button>
            <button type="button" className="brief-action" onClick={() => onDemoAction(r.demoViewError)}>
              {r.viewError}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
