"use client";

import type { TrackingObject } from "@/lib/domain/types";

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
  onDemoAction: (message: string) => void;
}

export function SearchRunner({ tracked, runner, onRun, onDemoAction }: SearchRunnerProps) {
  const failed = runner.state === "err";
  const displayName = tracked.name;
  const secondaryName = tracked.nameZh && tracked.nameZh !== tracked.name ? tracked.nameZh : "";

  return (
    <div className={`runner ${failed ? "failed" : ""}`}>
      <div className="runner-top">
        <div className="runner-target">
          <div className="label">当前追踪对象</div>
          <div className="name">
            {displayName}
            <span className="cn">{secondaryName}</span>
          </div>
        </div>
        <div className="runner-actions">
          <button type="button" className="btn-run" onClick={onRun} disabled={runner.state === "run"}>
            <span className="ic"></span>
            {runner.state === "run" ? "搜索中…" : "运行日更搜索"}
          </button>
        </div>
      </div>

      <div className="runner-stats">
        <div className="stat">
          <div className={`v ${runner.state === "run" ? "warn" : failed ? "danger" : ""}`}>{runner.queries}</div>
          <div className="l">查询数</div>
        </div>
        <div className="stat">
          <div className={`v ${failed ? "danger" : ""}`}>{runner.hits}</div>
          <div className="l">命中条目</div>
        </div>
        <div className="stat">
          <div className="v ok">{runner.signals}</div>
          <div className="l">候选信号</div>
        </div>
        <div className="stat">
          <div className={`v ${runner.dedup > 0 ? "warn" : ""}`}>{runner.dedup}</div>
          <div className="l">去重 / 重复</div>
        </div>
      </div>

      <div className="runner-state">
        <span className={`dot ${runner.state}`}></span>
        {runner.state === "idle" ? <span>就绪 · 上次运行 {runner.lastRun}</span> : null}
        {runner.state === "run" ? <span>正在向 19 个来源池发起查询…</span> : null}
        {runner.state === "ok" ? (
          <span>
            搜索完成 · {runner.lastRun} · 共发现 {runner.signals} 条候选信号（去重 {runner.dedup} 条）
          </span>
        ) : null}
        {runner.state === "err" ? (
          <span>
            搜索失败 · {runner.lastRun} · {runner.failReason}
          </span>
        ) : null}
      </div>

      {failed ? (
        <div className="fail-panel">
          <div className="title">⚠ 搜索管道异常</div>
          <ul>
            <li>SpaceNews API：连接超时（30s）</li>
            <li>NASA RSS：返回 503</li>
            <li>X / Twitter scraper：rate-limit（429）</li>
            <li>其他来源已正常返回，部分结果可能不完整</li>
          </ul>
          <div className="actions">
            <button type="button" className="brief-action" onClick={onRun}>
              ↻ 重试
            </button>
            <button type="button" className="brief-action" onClick={() => onDemoAction("使用上次成功缓存结果（演示）")}>
              使用缓存结果
            </button>
            <button type="button" className="brief-action" onClick={() => onDemoAction("查看搜索管道错误详情（演示）")}>
              查看错误详情
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
