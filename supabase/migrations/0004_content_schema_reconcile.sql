-- supabase/migrations/0004_content_schema_reconcile.sql
-- Reconcile the 0001 content schema with the richer demo/domain data before
-- migrating the 林哈哈聊太空 fixtures into the DB. Additive + safe for the ingest
-- pipeline (it already writes the narrower shape; new columns are nullable/defaulted).

-- tracking_objects.type — allow the full domain set (was: company|project only)
alter table tracking_objects drop constraint if exists tracking_objects_type_check;
alter table tracking_objects add constraint tracking_objects_type_check
  check (type in ('company', 'facility', 'program', 'project'));

-- tracking_objects.name_zh — Chinese display name (e.g. "中国空间站 · 嫦娥")
alter table tracking_objects add column if not exists name_zh text;

-- editorial_briefs — rich fields the curated demo briefs use
alter table editorial_briefs add column if not exists tagline text;
alter table editorial_briefs add column if not exists fact_bullets text[] not null default '{}';
