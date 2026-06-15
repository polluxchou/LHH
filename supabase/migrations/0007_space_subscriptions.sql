-- supabase/migrations/0007_space_subscriptions.sql
-- Persist per-user "我关注的" (tracking-object subscriptions) within a space, so the
-- workbench's followed list survives refresh. Reads scoped to space members; writes go
-- through the service-role client (membership checked in the server action).

create table space_subscriptions (
  space_id uuid not null references spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tracking_object_id uuid not null references tracking_objects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (space_id, user_id, tracking_object_id)
);
create index space_subscriptions_user_idx on space_subscriptions (space_id, user_id);

alter table space_subscriptions enable row level security;
create policy space_subscriptions_read on space_subscriptions
  for select using (is_space_member(space_id) or is_space_owner(space_id));
