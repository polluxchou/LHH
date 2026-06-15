-- supabase/migrations/0002_account_layer.sql
-- Phase 1: multi-space account layer (applications → spaces → members + invites).

create extension if not exists pgcrypto;

-- Public mirror of auth.users for display fields.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_char text not null default '·',
  color text not null default '#8b5e3c',
  created_at timestamptz not null default now()
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table spaces (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  name text not null,
  theme text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table space_members (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'member')),
  title text not null default '',
  joined_at timestamptz not null default now(),
  unique (space_id, user_id)
);

-- At most one admin per space.
create unique index space_members_one_admin_idx
  on space_members (space_id)
  where role = 'admin';

create table space_invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  email text not null,
  token text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- At most one pending invite per (space, email).
create unique index space_invites_one_pending_idx
  on space_invites (space_id, email)
  where status = 'pending';

create index space_members_user_idx on space_members (user_id);
create index spaces_application_idx on spaces (application_id);

-- ── RLS ──────────────────────────────────────────────────────
alter table profiles enable row level security;
alter table applications enable row level security;
alter table spaces enable row level security;
alter table space_members enable row level security;
alter table space_invites enable row level security;

-- Helper: is the current user a member of a given space?
create or replace function is_space_member(target_space uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members
    where space_id = target_space and user_id = auth.uid()
  );
$$;

-- Helper: is the current user the admin of a given space?
create or replace function is_space_admin(target_space uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from space_members
    where space_id = target_space and user_id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: is the current user the owner of the application owning a space?
create or replace function is_space_owner(target_space uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from spaces s
    join applications a on a.id = s.application_id
    where s.id = target_space and a.owner_id = auth.uid()
  );
$$;

-- profiles
create policy profiles_self_rw on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_shared_read on profiles
  for select using (
    exists (
      select 1 from space_members me
      join space_members them on them.space_id = me.space_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

-- applications
create policy applications_owner_rw on applications
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy applications_member_read on applications
  for select using (
    exists (
      select 1 from spaces s
      join space_members m on m.space_id = s.id
      where s.application_id = applications.id and m.user_id = auth.uid()
    )
  );

-- spaces
create policy spaces_member_read on spaces
  for select using (is_space_member(id) or is_space_owner(id));
create policy spaces_admin_update on spaces
  for update using (is_space_admin(id) or is_space_owner(id));
create policy spaces_owner_insert on spaces
  for insert with check (
    exists (select 1 from applications a where a.id = application_id and a.owner_id = auth.uid())
  );

-- space_members
create policy space_members_read on space_members
  for select using (is_space_member(space_id) or is_space_owner(space_id));
create policy space_members_manage on space_members
  for all using (is_space_admin(space_id) or is_space_owner(space_id))
  with check (is_space_admin(space_id) or is_space_owner(space_id));

-- space_invites (server-side acceptance uses service-role; these cover admin/owner management)
create policy space_invites_manage on space_invites
  for all using (is_space_admin(space_id) or is_space_owner(space_id))
  with check (is_space_admin(space_id) or is_space_owner(space_id));
