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
