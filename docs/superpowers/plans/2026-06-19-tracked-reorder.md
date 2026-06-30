# Drag-to-reorder Tracked Objects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user drag to reorder their「我关注的」tracked objects, persisted per-user in the DB so it survives refresh.

**Architecture:** Order lives on the per-user `space_subscriptions` table via a new `sort_order` column. `getSpaceSubscriptions` returns each user's object ids already sorted; the workbench renders the「mine」list in that order. Native HTML5 drag in `tracked-list.tsx` reorders optimistically in memory and persists via a `reorderSubscriptions` server action.

**Tech Stack:** Next.js (App Router, server actions), Supabase (Postgres + RLS), TypeScript, React, vitest.

**Spec:** `docs/superpowers/specs/2026-06-19-tracked-reorder-design.md`

**Branch/coordination:** Work on `feat/usage-dashboard`. `content-mutations.ts` / `content-queries.ts` / `workflow-provider.tsx` / `copy.ts` are shared with other sessions — commit only the files each task touches; `0013` migration must be applied to Supabase before deploy.

---

## File structure

- `supabase/migrations/0013_subscription_sort_order.sql` (new) — add + backfill `sort_order`.
- `lib/workflow/reorder.ts` (new) — pure `moveItem(ids, from, to)` helper.
- `tests/unit/reorder.test.ts` (new) — unit test for the helper.
- `lib/account/content-queries.ts` (modify) — `getSpaceSubscriptions` selects + orders by `sort_order`.
- `lib/account/content-mutations.ts` (modify) — new `reorderSubscriptions` server action.
- `lib/i18n/copy.ts` (modify) — `log.reorderFailed` (en + zh).
- `components/workbench/workflow-provider.tsx` (modify) — `reorderTracked` action + store field.
- `components/workbench/workbench.tsx` (modify) — order「mine」`visibleTracked` by subscription order; pass `onReorder`.
- `components/workbench/tracked-list.tsx` (modify) — DnD handlers, `draggable`, `onReorder` prop.
- `app/globals.css` (modify) — `.tracked-item.dragging` / `.drag-over`.

---

### Task 1: Migration 0013 — sort_order column

**Files:**
- Create: `supabase/migrations/0013_subscription_sort_order.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0013_subscription_sort_order.sql
-- Per-user ordering of the「我关注的」tracked list. Additive; column on the
-- already space-scoped space_subscriptions table (existing read RLS covers it,
-- writes go through service-role). nulls sort last so new subscriptions append.

alter table space_subscriptions add column if not exists sort_order integer;

-- backfill a stable initial order per (space_id, user_id) from current rows
with ordered as (
  select space_id, user_id, tracking_object_id,
    row_number() over (
      partition by space_id, user_id order by created_at, tracking_object_id
    ) - 1 as rn
  from space_subscriptions
)
update space_subscriptions s
  set sort_order = o.rn
  from ordered o
  where s.space_id = o.space_id
    and s.user_id = o.user_id
    and s.tracking_object_id = o.tracking_object_id
    and s.sort_order is null;

create index if not exists space_subscriptions_sort_idx
  on space_subscriptions (space_id, user_id, sort_order);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0013_subscription_sort_order.sql
git commit -m "feat(tracked): migration — sort_order on space_subscriptions"
```

> Note: not applied to the live DB here — handed to the user for SQL Editor (see Task 8).

---

### Task 2: Pure reorder helper (TDD)

**Files:**
- Create: `lib/workflow/reorder.ts`
- Test: `tests/unit/reorder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/reorder.test.ts
import { describe, it, expect } from "vitest";
import { moveItem } from "@/lib/workflow/reorder";

describe("moveItem", () => {
  it("moves an item down to a later index", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });
  it("moves an item up to an earlier index", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });
  it("is a no-op when from === to", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });
  it("returns a new array (does not mutate input)", () => {
    const input = ["a", "b"];
    const out = moveItem(input, 0, 1);
    expect(out).not.toBe(input);
    expect(input).toEqual(["a", "b"]);
  });
  it("clamps out-of-range indices instead of producing holes", () => {
    expect(moveItem(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/reorder.test.ts`
Expected: FAIL — cannot find module `@/lib/workflow/reorder`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/reorder.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/reorder.ts tests/unit/reorder.test.ts
git commit -m "feat(tracked): pure moveItem reorder helper + test"
```

---

### Task 3: getSpaceSubscriptions returns sorted order

**Files:**
- Modify: `lib/account/content-queries.ts` (the `getSpaceSubscriptions` function, ~line 124)

- [ ] **Step 1: Replace the query to select + order by sort_order**

Find:

```ts
  const { data } = await db.from("space_subscriptions").select("user_id, tracking_object_id").eq("space_id", spaceId);
  const byUser: Record<string, string[]> = {};
  for (const r of rows(data)) (byUser[r.user_id] ??= []).push(r.tracking_object_id);
  return byUser;
```

Replace with:

```ts
  const { data } = await db
    .from("space_subscriptions")
    .select("user_id, tracking_object_id, sort_order")
    .eq("space_id", spaceId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  const byUser: Record<string, string[]> = {};
  for (const r of rows(data)) (byUser[r.user_id] ??= []).push(r.tracking_object_id);
  return byUser;
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/account/content-queries.ts
git commit -m "feat(tracked): return per-user subscriptions in sort_order"
```

---

### Task 4: reorderSubscriptions server action

**Files:**
- Modify: `lib/account/content-mutations.ts` (add a new exported function near `setSubscription`)

- [ ] **Step 1: Add the action**

Insert after the `setSubscription` function:

```ts
/**
 * Persist the current user's「我关注的」order within a space: set sort_order = index
 * for each subscribed tracking object. Membership-checked; writes via service-role
 * (subscriptions table is read-only under RLS). Ids not currently subscribed are
 * ignored.
 */
export async function reorderSubscriptions(
  spaceId: string,
  orderedTrackingObjectIds: string[],
): Promise<{ ok: boolean; reason?: string }> {
  const mine = await getMySpaces();
  if (!mine.some((m) => m.space.id === spaceId)) return { ok: false, reason: "forbidden" };
  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return { ok: false, reason: "no_user" };
  const admin = createSupabaseAdminClient();
  for (let i = 0; i < orderedTrackingObjectIds.length; i++) {
    const { error } = await admin
      .from("space_subscriptions")
      .update({ sort_order: i })
      .eq("space_id", spaceId)
      .eq("user_id", userId)
      .eq("tracking_object_id", orderedTrackingObjectIds[i]);
    if (error) return { ok: false, reason: error.message };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (`getMySpaces`, `createSupabaseServerClient`, `createSupabaseAdminClient` are already imported in this file).

- [ ] **Step 3: Commit**

```bash
git add lib/account/content-mutations.ts
git commit -m "feat(tracked): reorderSubscriptions server action"
```

---

### Task 5: i18n — reorder failure log

**Files:**
- Modify: `lib/i18n/copy.ts` (the `log` namespace, en + zh blocks)

- [ ] **Step 1: Add `reorderFailed` to the en `log` block**

Find the en `log:` namespace and add, next to other log entries (e.g. after `briefNotPersisted`):

```ts
    reorderFailed: (reason: string) => `Reorder saved locally but not persisted · ${reason}`,
```

- [ ] **Step 2: Add `reorderFailed` to the zh `log` block (identical key)**

```ts
    reorderFailed: (reason) => `排序已在本地生效但未能保存 · ${reason}`,
```

- [ ] **Step 3: Run the i18n parity test + typecheck**

Run: `npx vitest run tests/unit/i18n.test.ts && npx tsc --noEmit`
Expected: PASS (en/zh key sets identical), no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/i18n/copy.ts
git commit -m "feat(tracked): i18n reorderFailed log (en/zh)"
```

---

### Task 6: workflow-provider — reorderTracked action

**Files:**
- Modify: `components/workbench/workflow-provider.tsx` (import, store interface ~line 90 area, action body near `subToggle` ~line 679)

- [ ] **Step 1: Import the action**

In the `content-mutations` import (line 7), add `reorderSubscriptions`:

```ts
import { addTrackingObjectToSpace, deleteTrackingObject, runSearchForObject, setSubscription, persistGeneratedBrief, persistScreeningDecision, persistTopicCardOwner, reorderSubscriptions } from "@/lib/account/content-mutations";
```

- [ ] **Step 2: Declare it on the store interface**

Right after the `subToggle` line in the `WorkbenchStore` interface:

```ts
  subToggle: (trackingObjectId: string) => void;
  /** 拖拽排序「我关注的」：乐观更新内存顺序 + 落库 */
  reorderTracked: (orderedTrackingObjectIds: string[]) => void;
```

- [ ] **Step 3: Implement the action**

Right after the `subToggle: (...) => { ... },` block:

```ts
    reorderTracked: (orderedTrackingObjectIds) => {
      const spaceId = session.currentSpaceId;
      const memberId = currentMember.id;
      setState((current) => ({
        ...current,
        teamMembers: current.teamMembers.map((m) =>
          m.id === memberId ? { ...m, trackingObjectIds: orderedTrackingObjectIds } : m,
        ),
      }));
      if (spaceId) {
        reorderSubscriptions(spaceId, orderedTrackingObjectIds)
          .then((res) => {
            if (!res.ok) store.logDemo("warning", L.reorderFailed(res.reason ?? L.errUnknown));
          })
          .catch((e) => store.logDemo("warning", L.reorderFailed(e instanceof Error ? e.message : L.errUnknown)));
      }
    },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/workbench/workflow-provider.tsx
git commit -m "feat(tracked): reorderTracked store action"
```

---

### Task 7: workbench — order mine list + pass onReorder

**Files:**
- Modify: `components/workbench/workbench.tsx` (`visibleTracked` ~line 35; `<TrackedList>` props ~line 173)

- [ ] **Step 1: Order the「mine」list by subscription order**

Replace the `visibleTracked` useMemo:

```ts
  const visibleTracked = useMemo(() => {
    if (store.scope === "team") {
      return state.trackingObjects;
    }
    const byId = new Map(state.trackingObjects.map((object) => [object.id, object]));
    return store.currentMember.trackingObjectIds
      .map((id) => byId.get(id))
      .filter((object): object is (typeof state.trackingObjects)[number] => Boolean(object));
  }, [state.trackingObjects, store.scope, store.currentMember]);
```

- [ ] **Step 2: Pass `onReorder` to `<TrackedList>`**

Add the prop in the `<TrackedList ... />` element (next to `onSubToggle`):

```tsx
          onSubToggle={store.subToggle}
          onReorder={store.reorderTracked}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: error — `onReorder` not in `TrackedListProps` yet (fixed in Task 8). This is expected; proceed to Task 8 before committing.

> Tasks 7 and 8 are committed together (the prop and its consumer must land in one commit to keep tsc green).

---

### Task 8: tracked-list — drag-and-drop + CSS

**Files:**
- Modify: `components/workbench/tracked-list.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add imports + the `onReorder` prop**

At the top of `tracked-list.tsx`, add React state import and the helper:

```ts
import { useState } from "react";
import { moveItem } from "@/lib/workflow/reorder";
```

In `TrackedListProps`, add after `onSubToggle`:

```ts
  onSubToggle: (trackingObjectId: string) => void;
  /** 仅「我关注的」可用：拖拽得到新顺序 */
  onReorder: (orderedTrackingObjectIds: string[]) => void;
```

Destructure `onReorder` in the component params (next to `onSubToggle`).

- [ ] **Step 2: Add drag state + handlers inside the component**

Right after `const tk = t.workbench.tracked;`:

```ts
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const canReorder = scope === "mine" && !collapsed;

  const handleDrop = (toIndex: number) => {
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    onReorder(moveItem(items.map((o) => o.id), dragIndex, toIndex));
    setDragIndex(null);
    setOverIndex(null);
  };
```

- [ ] **Step 3: Make each item draggable in mine scope**

On the `<button ... className={...} onClick={...}>` for each tracked item (the expanded list, ~line 91), add drag props and dynamic classes. The className becomes:

```tsx
              className={`tracked-item prio-${priorityClass(item.priority)} ${item.id === activeId ? "active" : ""} ${
                !isSubscribed && scope === "team" ? "not-mine" : ""
              } ${canReorder ? "draggable" : ""} ${dragIndex === index ? "dragging" : ""} ${
                canReorder && overIndex === index && dragIndex !== index ? "drag-over" : ""
              }`}
              draggable={canReorder}
              onDragStart={canReorder ? () => setDragIndex(index) : undefined}
              onDragOver={canReorder ? (e) => { e.preventDefault(); setOverIndex(index); } : undefined}
              onDrop={canReorder ? (e) => { e.preventDefault(); handleDrop(index); } : undefined}
              onDragEnd={canReorder ? () => { setDragIndex(null); setOverIndex(null); } : undefined}
```

This requires the `.map((item) => ...)` callback to expose `index`. Change the map signature to `items.map((item, index) => {`.

- [ ] **Step 4: Add the CSS**

Append to `app/globals.css` (near the other `.tracked-item` rules):

```css
.tracked-item.draggable { cursor: grab; }
.tracked-item.dragging { opacity: 0.45; }
.tracked-item.drag-over { box-shadow: inset 0 2px 0 0 var(--color-primary); }
```

- [ ] **Step 5: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: tsc 0 errors; lint only pre-existing warnings; build succeeds.

- [ ] **Step 6: Commit Tasks 7 + 8 together**

```bash
git add components/workbench/workbench.tsx components/workbench/tracked-list.tsx app/globals.css
git commit -m "feat(tracked): drag-to-reorder in the 我关注的 list"
```

---

### Task 9: Full verification + migration handoff

- [ ] **Step 1: Full test + build**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: all tests pass (including new `reorder.test.ts` + `i18n.test.ts`), tsc 0, build succeeds.

- [ ] **Step 2: Hand the migration to the user**

Give the user `supabase/migrations/0013_subscription_sort_order.sql` to run in the Supabase SQL Editor (project `sdqqanogjacvlizfuxuv`). Migration is additive + idempotent (`add column if not exists`, backfill only `where sort_order is null`).

- [ ] **Step 3: Confirm rollout order**

Do NOT push/merge to deploy until the user confirms `0013` is applied. Until then the `sort_order` read/write would fail; reorder degrades to a logged warning (in-memory order still works for the session).

---

## Self-review

- **Spec coverage:** data model (Task 1), getSpaceSubscriptions order (Task 3), order flow in workbench (Task 7), DnD + persist (Tasks 6–8), server action (Task 4), pure-helper test (Task 2), rollout/migration handoff (Task 9), graceful degradation (Task 6 `.catch` + Task 9 Step 3). All spec sections covered.
- **Placeholder scan:** none — every code step has full code.
- **Type consistency:** `moveItem(items, from, to)` defined in Task 2, used in Task 8. `reorderSubscriptions(spaceId, orderedIds)` defined Task 4, imported Task 6. `reorderTracked(orderedIds)` on store (Task 6) → passed as `onReorder` (Task 7) → consumed in `TrackedListProps` (Task 8). `L.reorderFailed` defined Task 5, used Task 6.
- **Shared-file note:** Tasks 3/4/5/6 touch files other sessions edit — commit per-task, keep diffs isolated, coordinate before push.
