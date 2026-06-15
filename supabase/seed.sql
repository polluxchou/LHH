insert into tracking_objects (
  id,
  name,
  type,
  aliases,
  country_or_region,
  official_url,
  primary_track,
  why_track,
  keywords,
  excluded_terms,
  languages,
  regions,
  preferred_sources,
  priority
) values
(
  '11111111-1111-1111-1111-111111111111',
  'Stoke Space',
  'company',
  array['Stoke', 'Stoke Space Technologies'],
  'United States',
  'https://www.stokespace.com',
  'launch',
  'Reusable launch vehicle startup with technical milestone and test-site signals.',
  array['Stoke Space', 'reusable rocket', 'Nova launch vehicle', 'engine test'],
  array['funding round', 'hiring event'],
  array['en'],
  array['United States'],
  array['official', 'regulator', 'trade_media'],
  1
),
(
  '22222222-2222-2222-2222-222222222222',
  'Starbase',
  'project',
  array['SpaceX Starbase', 'Boca Chica launch site'],
  'United States',
  'https://www.spacex.com/vehicles/starship/',
  'infrastructure',
  'Major launch-site and regulatory signal source for reusable super-heavy launch operations.',
  array['Starbase', 'Boca Chica', 'Starship launch license', 'launch site expansion'],
  array['tourism', 'merchandise'],
  array['en'],
  array['United States'],
  array['official', 'regulator', 'authoritative_media'],
  1
);

insert into sources (
  id,
  url,
  title,
  publisher,
  published_at,
  source_type,
  confidence,
  notes
) values
(
  '33333333-3333-3333-3333-333333333333',
  'https://example.com/stoke-hot-fire',
  'Stoke Space completes full-duration engine hot-fire test',
  'Example Aerospace Trade',
  '2026-06-01T12:00:00Z',
  'trade_media',
  0.72,
  'Internal seed source for Phase 0 demo data.'
),
(
  '44444444-4444-4444-4444-444444444444',
  'https://example.com/faa-starbase-license',
  'FAA issues updated launch license for Starbase operations',
  'Example Regulator Feed',
  '2026-06-02T12:00:00Z',
  'regulator',
  0.88,
  'Internal seed source for Phase 0 demo data.'
),
(
  '55555555-5555-5555-5555-555555555555',
  'https://example.com/stoke-test-site-expansion',
  'Test site expansion appears in local permit documents',
  'Example Local Records',
  '2026-06-03T12:00:00Z',
  'official',
  0.8,
  'Internal seed source for Phase 0 demo data.'
);

insert into location_anchors (
  id,
  name,
  type,
  latitude,
  longitude,
  country_or_region,
  description,
  related_tracking_object_ids,
  source_ids,
  confidence
) values
(
  '66666666-6666-6666-6666-666666666666',
  'Stoke Space test site',
  'test_site',
  47.3769,
  -120.302,
  'United States',
  'Seed test-site anchor associated with technical milestone monitoring.',
  array['11111111-1111-1111-1111-111111111111']::uuid[],
  array['33333333-3333-3333-3333-333333333333']::uuid[],
  0.7
),
(
  '77777777-7777-7777-7777-777777777777',
  'Starbase launch site',
  'launch_site',
  25.9972,
  -97.1566,
  'United States',
  'Seed launch-site anchor for policy and regulatory monitoring.',
  array['22222222-2222-2222-2222-222222222222']::uuid[],
  array['44444444-4444-4444-4444-444444444444']::uuid[],
  0.8
);

insert into search_runs (
  id,
  tracking_object_id,
  run_date,
  query_set,
  status,
  result_count,
  new_signal_count
) values
(
  '88888888-8888-8888-8888-888888888888',
  '11111111-1111-1111-1111-111111111111',
  '2026-06-07',
  array['Stoke Space engine test', 'Stoke Space reusable rocket milestone'],
  'completed',
  3,
  2
),
(
  '99999999-9999-9999-9999-999999999999',
  '22222222-2222-2222-2222-222222222222',
  '2026-06-07',
  array['Starbase launch license', 'Boca Chica launch site regulatory update'],
  'completed',
  2,
  1
);

insert into candidate_signals (
  id,
  tracking_object_id,
  search_run_id,
  signal_type,
  headline,
  summary,
  event_date,
  source_ids,
  dedupe_key,
  novelty_status,
  confidence
) values
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  '88888888-8888-8888-8888-888888888888',
  'technical_project_milestone',
  'Stoke Space completes full-duration engine hot-fire test',
  'A reported full-duration engine hot-fire suggests progress toward reusable launch vehicle milestones.',
  '2026-06-01',
  array['33333333-3333-3333-3333-333333333333']::uuid[],
  'stoke-space-hot-fire-2026-06-01',
  'new',
  0.72
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '11111111-1111-1111-1111-111111111111',
  '88888888-8888-8888-8888-888888888888',
  'location_facility_change',
  'Permit documents indicate Stoke Space test-site expansion',
  'Local permit records indicate a potential expansion around the company test site.',
  '2026-06-03',
  array['55555555-5555-5555-5555-555555555555']::uuid[],
  'stoke-space-test-site-expansion-2026-06-03',
  'new',
  0.8
),
(
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  '99999999-9999-9999-9999-999999999999',
  'policy_regulatory_change',
  'FAA issues updated launch license for Starbase operations',
  'A regulatory update changes the launch-operation context for Starbase.',
  '2026-06-02',
  array['44444444-4444-4444-4444-444444444444']::uuid[],
  'starbase-launch-license-2026-06-02',
  'new',
  0.88
);

insert into editorial_briefs (
  id,
  candidate_signal_id,
  tracking_object_id,
  brief_title,
  fact_summary,
  source_summary,
  map_context,
  why_it_matters,
  possible_angles,
  open_questions,
  risk_notes,
  location_anchor_ids,
  status
) values
(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Stoke Space engine test points to reusable launch progress',
  'A source reports that Stoke Space completed a full-duration engine hot-fire test.',
  'One trade-media seed source supports the milestone claim.',
  'The signal is associated with the Stoke Space test-site anchor.',
  'Engine test milestones can indicate whether a reusable launcher program is moving from concept toward flight readiness.',
  array['Technical explainer on reusable launch test milestones', 'Company tracking update on Stoke Space'],
  array['Was the test independently confirmed by the company or regulator?'],
  array['Single-source seed item; requires editor verification before publication.'],
  array['66666666-6666-6666-6666-666666666666']::uuid[],
  'screened'
),
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  '22222222-2222-2222-2222-222222222222',
  'Starbase regulatory update changes launch context',
  'A regulatory seed source reports an updated launch license for Starbase operations.',
  'One regulator-type seed source supports the update.',
  'The signal is associated with the Starbase launch-site anchor.',
  'Launch licenses shape operating tempo and public-policy risk for reusable super-heavy launch systems.',
  array['Policy explainer on launch-license constraints', 'Map update on Starbase operations'],
  array['What specific operating conditions changed?'],
  array['Regulatory text should be checked before publication.'],
  array['77777777-7777-7777-7777-777777777777']::uuid[],
  'ready_for_screening'
);

insert into content_value_scores (
  editorial_brief_id,
  freshness_score,
  importance_score,
  rarity_score,
  audience_interest_score,
  visual_potential_score,
  risk_score,
  overall_recommendation,
  scoring_notes
) values
(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  5,
  4,
  4,
  4,
  5,
  2,
  'strong',
  'Strong technical milestone with clear visual explanation potential.'
);

insert into screening_decisions (
  editorial_brief_id,
  decision,
  reason,
  decided_by
) values
(
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'approved',
  'Useful technical milestone for company tracking and reusable-launch explanation.',
  'seed-editor'
);

insert into topic_cards (
  id,
  source_editorial_brief_id,
  working_title,
  core_question,
  recommended_format,
  key_facts,
  source_ids,
  map_context,
  status
) values
(
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'Why Stoke Space engine testing matters for reusable launch',
  'Does this engine-test milestone indicate meaningful progress toward reusable launch operations?',
  'technical_explainer',
  array['Full-duration hot-fire test reported', 'Signal is tied to a test-site location anchor'],
  array['33333333-3333-3333-3333-333333333333']::uuid[],
  'Stoke Space test-site anchor provides geographic context for the milestone.',
  'new'
);
