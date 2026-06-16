"use client";

import { useEffect, useState } from "react";
import type { TeamMember, TrackingObjectType } from "@/lib/domain/types";
import type { AddTrackingObjectInput } from "@/lib/workflow/local-workflow";
import { PRIORITY_BY_CLASS } from "@/components/workbench/helpers";
import { useCopy } from "@/lib/i18n/locale-context";

interface AddTrackedDialogProps {
  open: boolean;
  currentMember: TeamMember;
  onClose: () => void;
  onAdd: (input: AddTrackingObjectInput) => void;
}

export function AddTrackedDialog({ open, currentMember, onClose, onAdd }: AddTrackedDialogProps) {
  const d = useCopy().dialogs.addTracked;
  const TYPE_OPTIONS: Array<{ value: TrackingObjectType; label: string; glyph: string; sub: string }> = [
    { value: "company", label: d.typeCompanyLabel, glyph: "🏢", sub: d.typeCompanySub },
    { value: "facility", label: d.typeFacilityLabel, glyph: "🚀", sub: d.typeFacilitySub },
    { value: "program", label: d.typeProgramLabel, glyph: "🛰", sub: d.typeProgramSub },
  ];
  const PRIORITY_OPTIONS: Array<{ value: "high" | "mid" | "low"; label: string; sub: string }> = [
    { value: "high", label: d.prioHighLabel, sub: d.prioHighSub },
    { value: "mid", label: d.prioMidLabel, sub: d.prioMidSub },
    { value: "low", label: d.prioLowLabel, sub: d.prioLowSub },
  ];
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
            <div className="at-kicker">{d.kicker}</div>
            <h2 className="at-title">{d.title}</h2>
            <div className="at-sub">{d.sub}</div>
          </div>
          <button type="button" className="at-close" onClick={onClose} aria-label={d.close}>
            ×
          </button>
        </header>

        <div className="at-body">
          <div className="at-row">
            <label className="at-field">
              <span className="at-label">
                {d.nameZhLabel}
                <span className="at-req">*</span>
              </span>
              <input
                className="at-input"
                placeholder={d.nameZhPlaceholder}
                value={nameZh}
                onChange={(event) => setNameZh(event.target.value)}
                autoFocus
              />
            </label>
            <label className="at-field">
              <span className="at-label">{d.nameEnLabel}</span>
              <input
                className="at-input"
                placeholder={d.nameEnPlaceholder}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>

          <div className="at-field">
            <span className="at-label">{d.typeLabel}</span>
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
            <span className="at-label">{d.priorityLabel}</span>
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
              <span className="at-label">{d.trackLabel}</span>
              <input
                className="at-input"
                placeholder={d.trackPlaceholder}
                value={track}
                onChange={(event) => setTrack(event.target.value)}
              />
            </label>
            <label className="at-field">
              <span className="at-label">{d.hqLabel}</span>
              <input
                className="at-input"
                placeholder={d.hqPlaceholder}
                value={headquarters}
                onChange={(event) => setHeadquarters(event.target.value)}
              />
            </label>
          </div>

          <label className="at-field">
            <span className="at-label">
              {d.keywordsLabel}
              <span className="at-label-aux">{d.keywordsAux}</span>
            </span>
            <input
              className="at-input"
              placeholder={d.keywordsPlaceholder}
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
            />
          </label>

          <label className="at-field">
            <span className="at-label">{d.reasonLabel}</span>
            <textarea
              className="at-textarea"
              placeholder={d.reasonPlaceholder}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
            />
          </label>

          <label className="at-checkbox-row">
            <input type="checkbox" checked={subscribe} onChange={(event) => setSubscribe(event.target.checked)} />
            <span className="at-checkbox-text">
              <b>{d.subscribeStrong(currentMember.name)}</b>
              <span>{d.subscribeRest}</span>
            </span>
          </label>
        </div>

        <footer className="at-foot">
          <span className="at-foot-info">{d.footInfo}</span>
          <span className="at-foot-spacer" />
          <button type="button" className="at-foot-btn ghost" onClick={onClose}>
            {d.cancel}
          </button>
          <button type="button" className="at-foot-btn primary" onClick={submit} disabled={!canSubmit}>
            {subscribe ? d.submitSubscribe : d.submitTeam}
          </button>
        </footer>
      </div>
    </div>
  );
}
