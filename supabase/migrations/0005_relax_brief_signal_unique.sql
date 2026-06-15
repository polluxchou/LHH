-- supabase/migrations/0005_relax_brief_signal_unique.sql
-- The curated demo legitimately has >1 editorial brief per candidate signal
-- (e.g. a "ready_for_screening" brief plus a "screened" brief that backs a topic
-- card). The 0001 schema enforced 1:1 via a UNIQUE on candidate_signal_id; relax it
-- to 1:many. Safe for the ingest pipeline (it still writes one brief per signal).
alter table editorial_briefs drop constraint if exists editorial_briefs_candidate_signal_id_key;

-- keep a non-unique index for lookups by signal
create index if not exists editorial_briefs_candidate_signal_idx on editorial_briefs (candidate_signal_id);
