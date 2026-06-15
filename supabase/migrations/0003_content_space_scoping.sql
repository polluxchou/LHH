-- supabase/migrations/0003_content_space_scoping.sql
-- Phase 2 (step 1): scope the 0001 content tables by space.
-- `sources` stays GLOBAL (shared article/source library, deduped by URL).
-- All other content tables get space_id + RLS. Existing rows backfill to 林哈哈聊太空.
--
-- NOTE on writes: RLS is enabled below with member/owner READ policies only.
-- The ingest writer must use the SERVICE-ROLE key (which bypasses RLS) and stamp
-- space_id on every row it inserts. Authenticated/anon writes are denied by design.

-- ── 1. add space_id columns ──────────────────────────────────
alter table tracking_objects     add column if not exists space_id uuid references spaces(id) on delete cascade;
alter table search_runs           add column if not exists space_id uuid references spaces(id) on delete cascade;
alter table candidate_signals     add column if not exists space_id uuid references spaces(id) on delete cascade;
alter table editorial_briefs      add column if not exists space_id uuid references spaces(id) on delete cascade;
alter table content_value_scores  add column if not exists space_id uuid references spaces(id) on delete cascade;
alter table topic_cards           add column if not exists space_id uuid references spaces(id) on delete cascade;
alter table location_anchors      add column if not exists space_id uuid references spaces(id) on delete cascade;

-- ── 2. backfill existing rows to the seeded 林哈哈聊太空 space ──────
do $$
declare default_space uuid;
begin
  select id into default_space from spaces where name = '林哈哈聊太空' order by created_at limit 1;
  if default_space is not null then
    update tracking_objects    set space_id = default_space where space_id is null;
    update search_runs          set space_id = default_space where space_id is null;
    update candidate_signals    set space_id = default_space where space_id is null;
    update editorial_briefs     set space_id = default_space where space_id is null;
    update content_value_scores set space_id = default_space where space_id is null;
    update topic_cards          set space_id = default_space where space_id is null;
    update location_anchors     set space_id = default_space where space_id is null;
  end if;
end $$;

-- ── 3. enforce NOT NULL + index for scoped reads ─────────────
alter table tracking_objects     alter column space_id set not null;
alter table search_runs           alter column space_id set not null;
alter table candidate_signals     alter column space_id set not null;
alter table editorial_briefs      alter column space_id set not null;
alter table content_value_scores  alter column space_id set not null;
alter table topic_cards           alter column space_id set not null;
alter table location_anchors      alter column space_id set not null;

create index if not exists tracking_objects_space_idx    on tracking_objects (space_id);
create index if not exists search_runs_space_idx          on search_runs (space_id);
create index if not exists candidate_signals_space_idx    on candidate_signals (space_id);
create index if not exists editorial_briefs_space_idx     on editorial_briefs (space_id);
create index if not exists content_value_scores_space_idx on content_value_scores (space_id);
create index if not exists topic_cards_space_idx          on topic_cards (space_id);
create index if not exists location_anchors_space_idx     on location_anchors (space_id);

-- ── 4. RLS: members/owner of the space may read; writes via service-role ──
do $$
declare t text;
begin
  foreach t in array array[
    'tracking_objects','search_runs','candidate_signals',
    'editorial_briefs','content_value_scores','topic_cards','location_anchors'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_space_read', t);
    execute format(
      'create policy %I on %I for select using (is_space_member(space_id) or is_space_owner(space_id))',
      t || '_space_read', t
    );
  end loop;
end $$;
