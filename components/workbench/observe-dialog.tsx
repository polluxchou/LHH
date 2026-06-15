"use client";

import { useEffect, useState } from "react";

interface ObserveDialogProps {
  open: boolean;
  briefTitle?: string;
  onClose: () => void;
  /** 确认后回传已填写的观察维度（已去空），随后简报进入持续观察 */
  onConfirm: (dimensions: string[]) => void;
}

export function ObserveDialog({ open, briefTitle, onClose, onConfirm }: ObserveDialogProps) {
  const [dimensions, setDimensions] = useState<string[]>([""]);

  useEffect(() => {
    if (open) {
      setDimensions([""]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const cleaned = dimensions.map((value) => value.trim()).filter((value) => value.length > 0);
  const canSubmit = cleaned.length > 0;

  const updateAt = (index: number, value: string) => {
    setDimensions((previous) => previous.map((item, i) => (i === index ? value : item)));
  };

  const removeAt = (index: number) => {
    setDimensions((previous) => (previous.length <= 1 ? [""] : previous.filter((_, i) => i !== index)));
  };

  const addRow = () => {
    setDimensions((previous) => [...previous, ""]);
  };

  const submit = () => {
    if (!canSubmit) {
      return;
    }

    onConfirm(cleaned);
    onClose();
  };

  return (
    <div className="at-backdrop" onClick={onClose}>
      <div className="at-dialog observe-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="at-head">
          <div>
            <div className="at-kicker">持续观察</div>
            <h2 className="at-title">添加观察维度</h2>
            <div className="at-sub">
              {briefTitle ? `「${briefTitle}」` : "这条简报"} · 列出需要持续关注的维度，确认后加入持续观察
            </div>
          </div>
        </header>

        <div className="at-body">
          <div className="observe-rows">
            {dimensions.map((value, index) => (
              <div key={index} className="observe-row">
                <span className="observe-row-no">{index + 1}</span>
                <input
                  className="at-input"
                  placeholder="例：下一次发射窗口 / FAA 调查结论 / 后续融资进展"
                  value={value}
                  autoFocus={index === dimensions.length - 1}
                  onChange={(event) => updateAt(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addRow();
                    }
                  }}
                />
                <button
                  type="button"
                  className="observe-row-del"
                  onClick={() => removeAt(index)}
                  aria-label="删除该维度"
                  title="删除该维度"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="observe-add" onClick={addRow}>
            + 添加观察维度
          </button>
        </div>

        <footer className="at-foot">
          <span className="at-foot-info">已填 {cleaned.length} 条 · 加入持续观察后可在简报卡上查看</span>
          <span className="at-foot-spacer" />
          <button type="button" className="at-foot-btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="at-foot-btn primary" onClick={submit} disabled={!canSubmit}>
            加入持续观察
          </button>
        </footer>
      </div>
    </div>
  );
}
