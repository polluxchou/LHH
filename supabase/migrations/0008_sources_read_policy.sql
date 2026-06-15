-- supabase/migrations/0008_sources_read_policy.sql
-- `sources` is the GLOBAL, shared article library (deduped by URL, written via the
-- service-role ingestion writer which bypasses RLS). The app, however, reads sources
-- with the END USER's session (anon key + auth cookie) when resolving a candidate
-- signal's source_ids. If RLS gets enabled on `sources` (e.g. via the dashboard's
-- "Enable RLS" nudge) WITHOUT a read policy, every user-side source read returns 0 rows
-- — which silently breaks the candidate-signal source link AND brief generation
-- ("Cannot generate editorial brief without at least one source").
--
-- This migration makes the read path correct REGARDLESS of whether RLS was toggled on:
-- enable RLS (idempotent) + a permissive SELECT policy so the global library stays
-- readable. Writes remain service-role-only (RLS is bypassed by the service role; no
-- insert/update/delete policy is granted to authenticated/anon).

alter table sources enable row level security;

drop policy if exists sources_read on sources;
create policy sources_read on sources for select using (true);
