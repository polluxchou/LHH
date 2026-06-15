interface SectionHintProps {
  label: string;
  description: string;
}

export function SectionHint({ label, description }: SectionHintProps) {
  return (
    <span
      className="section-hint"
      role="note"
      tabIndex={0}
      aria-label={`${label}: ${description}`}
      data-tooltip={`${label} · ${description}`}
    >
      i
    </span>
  );
}
