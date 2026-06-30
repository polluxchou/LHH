// lib/workflow/reorder.ts
/** Move the item at `from` to `to`, returning a new array. Indices are clamped. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const lastFrom = Math.max(0, Math.min(from, next.length - 1));
  const [moved] = next.splice(lastFrom, 1);
  if (moved === undefined) return next;
  const lastTo = Math.max(0, Math.min(to, next.length));
  next.splice(lastTo, 0, moved);
  return next;
}
