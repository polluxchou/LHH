"use client";

import { useEffect, useState } from "react";
import type { TeamMember, TrackingObjectType } from "@/lib/domain/types";
import type { AddTrackingObjectInput } from "@/lib/workflow/local-workflow";
import { PRIORITY_BY_CLASS } from "@/components/workbench/helpers";

interface AddTrackedDialogProps {
  open: boolean;
  currentMember: TeamMember;
  onClose: () => void;
  onAdd: (input: AddTrackingObjectInput) => void;
}

const TYPE_OPTIONS: Array<{ value: TrackingObjectType; label: string; glyph: string; sub: string }> = [
  { value: "company", label: "公司", glyph: "🏢", sub: "私营 / 上市 / 创业" },
  { value: "facility", label: "设施", glyph: "🚀", sub: "发射场 · 工厂 · 试验场" },
  { value: "program", label: "项目", glyph: "🛰", sub: "国家项目 · 任务系列" },
];

const PRIORITY_OPTIONS: Array<{ value: "high" | "mid" | "low"; label: string; sub: string }> = [
  { value: "high", label: "高", sub: "每日搜索 · 优先生成简报" },
  { value: "mid", label: "中", sub: "每日搜索 · 中等阈值" },
  { value: "low", label: "低", sub: "每周搜索 · 仅大事件" },
];

export function AddTrackedDialog({ open, currentMember, onClose, onAdd }: AddTrackedDialogProps) {
  const [nameZh, setNameZh] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<TrackingObjectType>("company");
  const [priority, setPriority] = useState<"high" | "mid" | "low">("mid");
  const [track, setTrack] = useState("");
  const [headquarters, setHeadquarters] = useState("");
  const [keywords, setKeywords] = useState("");
  const [reason, setReason] = useState("");
  const [subscribe, setSubscribe] = useState(true);

  useEffect(() => {
    if (open) {
      setNameZh("");
      setName("");
      setType("company");
      setPriority("mid");
      setTrack("");
      setHeadquarters("");
      setKeywords("");
      setReason("");
      setSubscribe(true);
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

  const canSubmit = nameZh.trim().length > 0;

  const submit = () => {
    if (!canSubmit) {
      return;
    }

    onAdd({
      nameZh: nameZh.trim(),
      name: name.trim() || undefined,
      type,
      priority: PRIORITY_BY_CLASS[priority],
      primaryTrack: track.trim() || undefined,
      headquarters: headquarters.trim() || undefined,
      keywords: keywords.split(/[,，、\s]+/).filter(Boolean).slice(0, 5),
      whyTrack: reason.trim() || undefined,
      subscribe,
    });
    onClose();
  };

  return (
    <div className="at-backdrop" onClick={onClose}>
      <div className="at-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="at-head">
          <div>
            <div className="at-kicker">新增追踪对象</div>
            <h2 className="at-title">添加一个新的航空航天对象</h2>
            <div className="at-sub">每天的日更搜索会自动覆盖它 · 你可以选择只自己订阅，或者推荐给团队</div>
          </div>
          <button type="button" className="at-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="at-body">
          <div className="at-row">
            <label className="at-field">
              <span className="at-label">
                中文名称<span className="at-req">*</span>
              </span>
              <input
                className="at-input"
                placeholder="例：天兵科技"
                value={nameZh}
                onChange={(event) => setNameZh(event.target.value)}
                autoFocus
              />
            </label>
            <label className="at-field">
              <span className="at-label">英文 / 官方名（用于搜索）</span>
              <input
                className="at-input"
                placeholder="例：Space Pioneer"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>

          <div className="at-field">
            <span className="at-label">类型</span>
            <div className="at-radio-row">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`at-radio ${type === option.value ? "active" : ""}`}
                  onClick={() => setType(option.value)}
                >
                  <span className="at-radio-glyph">{option.glyph}</span>
                  <span className="at-radio-lbl">{option.label}</span>
                  <span className="at-radio-sub">{option.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="at-field">
            <span className="at-label">优先级</span>
            <div className="at-radio-row">
              {PRIORITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`at-radio compact prio-${option.value} ${priority === option.value ? "active" : ""}`}
                  onClick={() => setPriority(option.value)}
                >
                  <span className="at-radio-lbl">{option.label}</span>
                  <span className="at-radio-sub">{option.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="at-row">
            <label className="at-field">
              <span className="at-label">赛道 / 业务方向</span>
              <input
                className="at-input"
                placeholder="例：液氧煤油 · 中型运载"
                value={track}
                onChange={(event) => setTrack(event.target.value)}
              />
            </label>
            <label className="at-field">
              <span className="at-label">总部 / 主要地点</span>
              <input
                className="at-input"
                placeholder="例：北京 · 张家口"
                value={headquarters}
                onChange={(event) => setHeadquarters(event.target.value)}
              />
            </label>
          </div>

          <label className="at-field">
            <span className="at-label">
              关键词 / 别名（用于搜索去重）
              <span className="at-label-aux">用逗号或空格分隔 · 最多 5 个</span>
            </span>
            <input
              className="at-input"
              placeholder="例：天兵, Space Pioneer, 天龙三号, 创始人康永来"
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
            />
          </label>

          <label className="at-field">
            <span className="at-label">关注理由 / 简介（可选）</span>
            <textarea
              className="at-textarea"
              placeholder="一句话说明为什么团队要追这个对象 · 显示在追踪对象卡上"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </label>

          <label className="at-checkbox-row">
            <input type="checkbox" checked={subscribe} onChange={(event) => setSubscribe(event.target.checked)} />
            <span className="at-checkbox-text">
              <b>立即由我（{currentMember.name}）订阅</b>
              <span> · 加入“我关注的”列表，每天搜索结果会推到你的工作台</span>
            </span>
          </label>
        </div>

        <footer className="at-foot">
          <span className="at-foot-info">添加后会在下一次日更搜索时生效 · 也可手动运行</span>
          <span className="at-foot-spacer" />
          <button type="button" className="at-foot-btn ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="at-foot-btn primary" onClick={submit} disabled={!canSubmit}>
            {subscribe ? "添加并订阅" : "添加到团队池"}
          </button>
        </footer>
      </div>
    </div>
  );
}
