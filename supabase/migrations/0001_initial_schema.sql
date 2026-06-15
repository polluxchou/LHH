create extension if not exists pgcrypto;

create table tracking_objects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('company', 'project')),
  aliases text[] not null default '{}',
  country_or_region text not null,
  official_url text,
  primary_track text not null,
  why_track text not null,
  keywords text[] not null default '{}',
  excluded_terms text[] not null default '{}',
  languages text[] not null default '{}',
  regions text[] not null default '{}',
  preferred_sources text[] not null default '{}',
  search_frequency text not null default 'daily',
  priority integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table location_anchors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (
    type in (
      'launch_site',
      'company_office',
      'manufacturing_supply_chain',
      'test_site',
      'investor_policy_industrial_park'
    )
  ),
  latitude double precision,
  longitude double precision,
  country_or_region text not null,
  description text,
  related_tracking_object_ids uuid[] not null default '{}',
  source_ids uuid[] not null default '{}',
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1)
);

create table search_runs (
  id uuid primary key default gen_random_uuid(),
  tracking_object_id uuid not null references tracking_objects(id) on delete cascade,
  run_date date not null default current_date,
  query_set text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  result_count integer not null default 0,
  new_signal_count integer not null default 0,
  error_summary text
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  publisher text,
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  source_type text not null default 'other' check (
    source_type in (
      'official',
      'regulator',
      'authoritative_media',
      'trade_media',
      'social_public_post',
      'database',
      'other'
    )
  ),
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  notes text
);

create table candidate_signals (
  id uuid primary key default gen_random_uuid(),
  tracking_object_id uuid not null references tracking_objects(id) on delete cascade,
  search_run_id uuid not null references search_runs(id) on delete cascade,
  signal_type text not null check (
    signal_type in (
      'technical_project_milestone',
      'location_facility_change',
      'policy_regulatory_change'
    )
  ),
  headline text not null,
  summary text not null,
  event_date date,
  detected_at timestamptz not null default now(),
  source_ids uuid[] not null default '{}',
  dedupe_key text not null,
  novelty_status text not null default 'new' check (novelty_status in ('new', 'updated', 'duplicate', 'unclear')),
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  unique (tracking_object_id, dedupe_key)
);

create table editorial_briefs (
  id uuid primary key default gen_random_uuid(),
  candidate_signal_id uuid not null unique references candidate_signals(id) on delete cascade,
  tracking_object_id uuid not null references tracking_objects(id) on delete cascade,
  brief_title text not null,
  fact_summary text not null,
  source_summary text not null,
  map_context text,
  why_it_matters text not null,
  possible_angles text[] not null default '{}',
  open_questions text[] not null default '{}',
  risk_notes text[] not null default '{}',
  location_anchor_ids uuid[] not null default '{}',
  status text not null default 'ready_for_screening' check (status in ('draft', 'ready_for_screening', 'screened')),
  created_at timestamptz not null default now()
);

create table content_value_scores (
  editorial_brief_id uuid primary key references editorial_briefs(id) on delete cascade,
  freshness_score integer not null check (freshness_score between 1 and 5),
  importance_score integer not null check (importance_score between 1 and 5),
  rarity_score integer not null check (rarity_score between 1 and 5),
  audience_interest_score integer not null check (audience_interest_score between 1 and 5),
  visual_potential_score integer not null check (visual_potential_score between 1 and 5),
  risk_score integer not null check (risk_score between 1 and 5),
  overall_recommendation text not null check (overall_recommendation in ('strong', 'medium', 'weak')),
  scoring_notes text not null
);

create table screening_decisions (
  editorial_brief_id uuid primary key references editorial_briefs(id) on delete cascade,
  decision text not null check (decision in ('approved', 'watch', 'rejected')),
  reason text not null,
  decided_by text not null,
  decided_at timestamptz not null default now()
);

create table topic_cards (
  id uuid primary key default gen_random_uuid(),
  source_editorial_brief_id uuid not null unique references editorial_briefs(id) on delete cascade,
  working_title text not null,
  core_question text not null,
  recommended_format text not null check (
    recommended_format in (
      'news_brief',
      'technical_explainer',
      'company_tracking',
      'policy_explainer',
      'industry_map',
      'other'
    )
  ),
  key_facts text[] not null default '{}',
  source_ids uuid[] not null default '{}',
  map_context text,
  status text not null default 'new' check (
    status in ('new', 'assigned', 'in_research', 'in_writing', 'paused', 'done')
  )
);

create index tracking_objects_name_idx on tracking_objects (name);
create index search_runs_tracking_object_idx on search_runs (tracking_object_id);
create index candidate_signals_tracking_object_idx on candidate_signals (tracking_object_id);
create index editorial_briefs_status_idx on editorial_briefs (status);
create index topic_cards_status_idx on topic_cards (status);
