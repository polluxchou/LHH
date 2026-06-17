-- supabase/migrations/0010_screening_topic_persistence.sql
-- Persist on-demand screening decisions + topic cards (previously in-memory only).
-- Adds the columns the domain model carries but the 0001 schema lacked, and brings
-- screening_decisions into the same space-scoping + RLS regime as 0003 (it had been
-- overlay-only for the demo space, so 0003 skipped it).
--
-- Writes go through the SERVICE-ROLE key (bypasses RLS) and stamp space_id; the
-- policies below grant members/owner READ only — same contract as 0003.

-- ── topic_cards: owner, observation dimensions, format label ──────────
alter table topic_cards add column if not exists owner_id text;
alter table topic_cards add column if not exists observation_dimensions text[] not null default '{}';
alter table topic_cards add column if not exists format_label text;

-- ── screening_decisions: observation dimensions + space scoping ───────
alter table screening_decisions add column if not exists observation_dimensions text[] not null default '{}';
alter table screening_decisions add column if not exists space_id uuid references spaces(id) on delete cascade;

-- backfill space_id from each decision's editorial brief (briefs are already space-scoped)
update screening_decisions sd
  set space_id = eb.space_id
  from editorial_briefs eb
  where sd.editorial_brief_id = eb.id and sd.space_id is null;

alter table screening_decisions alter column space_id set not null;
create index if not exists screening_decisions_space_idx on screening_decisions (space_id);

-- ── RLS: members/owner of the space may read; writes via service-role ──
alter table screening_decisions enable row level security;
drop policy if exists screening_decisions_space_read on screening_decisions;
create policy screening_decisions_space_read on screening_decisions
  for select using (is_space_member(space_id) or is_space_owner(space_id));
