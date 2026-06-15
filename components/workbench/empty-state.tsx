export function EmptyState({
  glyph,
  title,
  sub,
  flush = false,
}: {
  glyph: string;
  title: string;
  sub: string;
  flush?: boolean;
}) {
  return (
    <div className={`empty${flush ? " flush" : ""}`}>
      <div className="glyph">{glyph}</div>
      <div className="title">{title}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

export function EmptyMini({ glyph, title, sub }: { glyph: string; title: string; sub: string }) {
  return (
    <div className="empty-mini">
      <div className="glyph">{glyph}</div>
      <div className="title">{title}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}
