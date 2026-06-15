"use client";

import type { WorkflowRunLogEntry } from "@/lib/workflow/local-workflow";
import { LOG_LV_BY_LEVEL, formatRunLogLine, formatTimeHMS } from "@/components/workbench/helpers";
import type { Locale } from "@/lib/i18n/copy";

interface LogDrawerProps {
  logs: WorkflowRunLogEntry[];
  locale: Locale;
  expanded: boolean;
  onToggle: () => void;
}

export function LogDrawer({ logs, locale, expanded, onToggle }: LogDrawerProps) {
  const okCount = logs.filter((entry) => entry.level === "success").length;
  const warnCount = logs.filter((entry) => entry.level === "warning").length;
  const errCount = logs.filter((entry) => entry.level === "error").length;
  const infoCount = logs.length - okCount - warnCount - errCount;
  const last = logs.at(-1);
  const lastLine = last ? formatRunLogLine(last, locale) : "";

  return (
    <div className={`logdrawer ${expanded ? "expanded" : "collapsed"}`}>
      <div className="lhead" onClick={onToggle}>
        <span className="chevron">▸</span>
        <span className="l">
          <span className="accent">⌬</span> SYSTEM LOG
        </span>
        {!expanded && last ? (
          <span className="lhead-preview">
            <span className="t">{formatTimeHMS(last.timestamp)}</span> ·{" "}
            {lastLine.length > 60 ? `${lastLine.slice(0, 60)}…` : lastLine}
          </span>
        ) : null}
        <span className="counts">
          <span>
            info <b>{infoCount}</b>
          </span>
          <span>
            ok <b className="ok">{okCount}</b>
          </span>
          <span>
            warn <b className="warn">{warnCount}</b>
          </span>
          <span>
            err <b className="err">{errCount}</b>
          </span>
        </span>
      </div>
      {expanded ? (
        <div
          className="logbody"
          ref={(element) => {
            if (element) {
              element.scrollTop = element.scrollHeight;
            }
          }}
        >
          {logs.map((entry) => {
            const lv = LOG_LV_BY_LEVEL[entry.level];

            return (
              <div key={entry.id} className="logline">
                <span className="t">{formatTimeHMS(entry.timestamp)}</span>
                <span className={`lv ${lv}`}>{lv}</span>
                <span className="msg">{formatRunLogLine(entry, locale)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
