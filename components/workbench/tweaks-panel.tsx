"use client";

import { useEffect, useState } from "react";
import type { BriefStyle } from "@/components/workbench/briefings-section";
import { useCopy } from "@/lib/i18n/locale-context";

export interface WorkbenchTweaks {
  theme: "warm" | "cool" | "dark";
  font: "sans" | "serif" | "mono";
  briefStyle: BriefStyle;
}

export const TWEAK_DEFAULTS: WorkbenchTweaks = { theme: "warm", font: "sans", briefStyle: "card" };

const STORAGE_KEY = "lhh-workbench-tweaks-v1";

/** Display settings backed by localStorage + body classes (theme/font). */
export function useWorkbenchTweaks(): [WorkbenchTweaks, (patch: Partial<WorkbenchTweaks>) => void] {
  const [tweaks, setTweaks] = useState<WorkbenchTweaks>(TWEAK_DEFAULTS);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (raw) {
        setTweaks({ ...TWEAK_DEFAULTS, ...(JSON.parse(raw) as Partial<WorkbenchTweaks>) });
      }
    } catch {
      // ignore unreadable settings
    }
  }, []);

  useEffect(() => {
    const body = document.body;

    body.classList.remove("theme-warm", "theme-cool", "theme-dark", "font-sans", "font-serif", "font-mono");
    body.classList.add(`theme-${tweaks.theme}`, `font-${tweaks.font}`);

    return () => {
      body.classList.remove("theme-warm", "theme-cool", "theme-dark", "font-sans", "font-serif", "font-mono");
    };
  }, [tweaks.theme, tweaks.font]);

  const update = (patch: Partial<WorkbenchTweaks>) => {
    setTweaks((previous) => {
      const next = { ...previous, ...patch };

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore write failures (private mode etc.)
      }

      return next;
    });
  };

  return [tweaks, update];
}

export function TweaksPanel({
  tweaks,
  onChange,
}: {
  tweaks: WorkbenchTweaks;
  onChange: (patch: Partial<WorkbenchTweaks>) => void;
}) {
  const [open, setOpen] = useState(false);
  const tw = useCopy().dialogs.tweaks;
  const GROUPS: Array<{
    key: keyof WorkbenchTweaks;
    label: string;
    options: Array<{ value: string; label: string }>;
  }> = [
    {
      key: "theme",
      label: tw.groupTheme,
      options: [
        { value: "warm", label: tw.themeWarm },
        { value: "cool", label: tw.themeCool },
        { value: "dark", label: tw.themeDark },
      ],
    },
    {
      key: "font",
      label: tw.groupFont,
      options: [
        { value: "sans", label: tw.fontSans },
        { value: "serif", label: tw.fontSerif },
        { value: "mono", label: tw.fontMono },
      ],
    },
    {
      key: "briefStyle",
      label: tw.groupBriefStyle,
      options: [
        { value: "card", label: tw.styleCard },
        { value: "table", label: tw.styleTable },
        { value: "timeline", label: tw.styleTimeline },
      ],
    },
  ];

  return (
    <div className="tweaks-host">
      {open ? (
        <div className="tweaks-pop">
          <div className="tw-head">{tw.head}</div>
          {GROUPS.map((group) => (
            <div key={group.key} className="tw-group">
              <div className="tw-label">{group.label}</div>
              <div className="tw-options">
                {group.options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`tw-option ${tweaks[group.key] === option.value ? "active" : ""}`}
                    onClick={() => onChange({ [group.key]: option.value } as Partial<WorkbenchTweaks>)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" className="tweaks-fab" onClick={() => setOpen((value) => !value)}>
        ⚙ Tweaks
      </button>
    </div>
  );
}
