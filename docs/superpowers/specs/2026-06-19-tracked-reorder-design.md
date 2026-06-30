# Drag-to-reorder Tracked Objects (per-user, persisted)

**Date:** 2026-06-19
**Status:** Design — awaiting review

## Problem

The「追踪对象」(Tracked objects) list renders in the space-wide `trackingObjects`
array order, which is identical for every member and not user-adjustable. Users
want to drag items to arrange their own followed list, and have that order
survive refresh / device change.

## Decision

Order is a **per-user preference**, stored on the existing per-user
`space_subscriptions` table. Therefore reordering applies to the **「我关注的」
(mine)** view (the user's subscribed objects). The「团队全部」(team) view keeps
the space array order — objects a user does not follow have no per-user position.

## Data model

Migration **`0013_subscription_sort_order.sql`**:

- `alter table space_subscriptions add column if not exists sort_order integer;`
- Backfill existing rows with a stable initial order per `(space_id, user_id)`,
  derived from current row order (e.g. `row_number() over (partition by space_id,
  user_id order by created_at, tracking_object_id)`), so today's lists are
  unchanged on first load.
- No new RLS needed (column on an already-scoped table; reads via the existing
  `space_subscriptions_read` policy, writes via service-role).

`sort_order` is nullable; `null` sorts last (newly subscribed objects append).

## Order flow

1. `getSpaceSubscriptions` (content-queries) selects `sort_order` and returns each
   user's `tracking_object_id[]` **ordered by `sort_order` nulls last**, then
   `created_at` as a tiebreak. So `byUser[userId]` is already in custom order.
2. `build-space-state` already builds `teamMembers[].trackingObjectIds` from that
   map — no change needed; the array is now pre-sorted.
3. `workbench.tsx` `visibleTracked`: for **mine** scope, order the visible objects
   by `currentMember.trackingObjectIds` (the sorted subscription order) instead of
   the `trackingObjects` array order. **Team** scope is unchanged (space order).
4. The collapsed rail renders the same `items`, so it reflects the order without
   its own drag affordance.

## Drag + persist

- `tracked-list.tsx`: in **mine** scope, each `.tracked-item` is `draggable`. Native
  HTML5 DnD handlers (`onDragStart` / `onDragOver` / `onDrop` / `onDragEnd`) compute
  the new ordered id list. Dragging and drop-target rows get a visual state
  (`.dragging` / `.drag-over`). Drag is disabled in team scope and the collapsed rail.
- On drop → `store.reorderTracked(orderedIds)`:
  - **Optimistic**: update `currentMember.trackingObjectIds` to `orderedIds`
    in-memory (instant reorder, no flicker).
  - **Persist**: call server action `reorderSubscriptions(spaceId, orderedIds)`;
    on failure, log a warning (the in-memory order still holds for the session).
  - No `router.refresh()` — the in-memory order already matches what the DB now
    stores; a later refresh reloads the same order from the DB.

## Server action

`reorderSubscriptions(spaceId, orderedTrackingObjectIds)` in `content-mutations.ts`:

- Membership check via `getMySpaces()`; resolve current `userId` via the server
  client; write via the service-role client (subscriptions table is read-only RLS).
- For each id at index `i`, `update space_subscriptions set sort_order = i where
  space_id = … and user_id = … and tracking_object_id = id`. Ids not currently
  subscribed are ignored (defensive).

## Files

- `supabase/migrations/0013_subscription_sort_order.sql` (new)
- `lib/account/content-queries.ts` — `getSpaceSubscriptions` selects + orders by `sort_order`
- `lib/account/content-mutations.ts` — new `reorderSubscriptions`
- `components/workbench/workflow-provider.tsx` — `reorderTracked` action + store field
- `components/workbench/workbench.tsx` — mine-scope ordering + pass `onReorder`
- `components/workbench/tracked-list.tsx` — DnD handlers, `draggable`, drag state
- `app/globals.css` — `.tracked-item.dragging` / `.drag-over` styles

## Rollout

Migration-before-deploy, same as 0010–0012: apply `0013` in Supabase SQL Editor,
confirm reorder reads/writes work, **then** push/merge (push triggers Vercel deploy).
Until `0013` is applied, the new `sort_order` reads/writes would fail — so code must
not deploy first. (Reorder degrades gracefully if the column is missing: the update
errors are logged and the in-memory order still works for the session.)

## Testing

- Unit: a pure `applyReorder(ids, from, to)` helper (move-within-array) with a test.
- The server action + DB write are not unit-testable here (no local DB); verified by
  the migration apply + manual reorder→refresh check on the deployed app.

## Out of scope

- Reordering in the team view or the collapsed rail.
- Reordering objects you don't follow.
- Cross-user / team-shared ordering.
