# Aerospace Intelligence Screening MVP Design

## Purpose

Build an internal workflow product for an aerospace technology media team. The first version helps editors track aerospace startup and innovation projects, run daily web-search updates, turn new signals into source-backed editorial briefs, screen them with content-value scoring, and send approved briefs into a topic pool.

This MVP intentionally starts before full content generation. The product should improve the team's ability to decide what is worth covering before it generates scripts, storyboards, voiceover, or final video.

## Product Direction

The approved MVP route is **intelligence screening desk first**.

The core loop is:

1. Submit tracked company/project.
2. Run daily web-search updates.
3. Generate editorial briefs from relevant changes.
4. Score and screen each brief.
5. Move approved briefs into the topic pool.

The global map is included as context, not as the primary MVP surface. Each tracked company/project can accumulate location anchors, and each editorial brief can reference map locations. The full global intelligence map becomes stronger as the screening workflow produces confirmed data.

## Scope

### In Scope

- Company/project tracking object library.
- Tracking configuration: aliases, keywords, excluded terms, regions, languages, official URLs, source preferences, and search cadence.
- Daily web-search task per tracking object.
- Signal extraction for three priority change types:
  - Technical/project milestones.
  - Location/facility changes.
  - Policy/regulatory changes.
- AI-generated editorial brief for candidate signals.
- Source list and source traceability for each brief.
- Map/location associations for each brief.
- Content-value scoring.
- Screening decisions: approved, watch, rejected.
- Topic pool containing only approved briefs.
- Clear UI feedback when an editor selects, confirms, scores, approves, rejects, or sends an item forward.

### Out of Scope For MVP

- Funding-round and public-market dashboard.
- University/research-institute location type.
- Fully automated script, storyboard, voiceover, or video generation.
- Large-scale real-time OSINT monitoring.
- Complex graph editor.
- External collaborator workspace or customer-facing permissions.
- Direct fork of Crucix.

## Crucix Reference Position

Crucix should be treated as an architectural reference, not a codebase to fork. Useful ideas include source adapters, scheduled sweeps, delta detection, source health, alerting, map context, and lightweight LLM briefs.

The product should rebuild its own data model around aerospace editorial needs. Direct adoption is not recommended because Crucix is OSINT-dashboard-oriented, uses AGPL licensing, and does not contain the required content-screening and editorial workflow objects.

## Users

### Editor

Maintains tracking objects, reviews daily briefs, scores content value, and decides whether a signal enters the topic pool.

### Researcher

Adds sources, verifies facts, improves search queries, and adds map/location context.

### Producer

Uses approved topic cards later to create scripts, storyboards, voiceover plans, and video tasks. Producer workflow is downstream of this MVP.

## Data Model

### Tracking Object

Represents a company or project being monitored.

Core fields:

- `id`
- `name`
- `type`: company or project
- `aliases`
- `country_or_region`
- `official_url`
- `primary_track`: launch, satellite, propulsion, manufacturing, infrastructure, defense, policy, or other
- `why_track`
- `keywords`
- `excluded_terms`
- `languages`
- `regions`
- `preferred_sources`
- `search_frequency`: default daily
- `priority`
- `created_by`
- `created_at`
- `updated_at`

### Location Anchor

Represents a location associated with a tracked company/project or brief.

Supported MVP location types:

- Launch site / spaceport.
- Company headquarters / office.
- Manufacturing / assembly / supply-chain facility.
- Test site / test stand / test base.
- Investor / policy / industrial park node.

Core fields:

- `id`
- `name`
- `type`
- `latitude`
- `longitude`
- `country_or_region`
- `description`
- `related_tracking_object_ids`
- `source_ids`
- `confidence`

### Search Run

Represents one scheduled web-search update.

Core fields:

- `id`
- `tracking_object_id`
- `run_date`
- `query_set`
- `status`
- `result_count`
- `new_signal_count`
- `error_summary`

### Candidate Signal

Represents a search result or clustered set of results that may be worth briefing.

Priority signal types:

- Technical/project milestone.
- Location/facility change.
- Policy/regulatory change.

Core fields:

- `id`
- `tracking_object_id`
- `search_run_id`
- `signal_type`
- `headline`
- `summary`
- `event_date`
- `detected_at`
- `source_ids`
- `dedupe_key`
- `novelty_status`: new, updated, duplicate, or unclear
- `confidence`

### Source

Represents a cited information source.

Core fields:

- `id`
- `url`
- `title`
- `publisher`
- `published_at`
- `retrieved_at`
- `source_type`: official, regulator, authoritative media, trade media, social/public post, database, or other
- `confidence`
- `notes`

### Editorial Brief

Represents the AI-generated and editor-reviewable summary of a candidate signal.

Core fields:

- `id`
- `candidate_signal_id`
- `tracking_object_id`
- `brief_title`
- `fact_summary`
- `source_summary`
- `map_context`
- `why_it_matters`
- `possible_angles`
- `open_questions`
- `risk_notes`
- `location_anchor_ids`
- `created_at`
- `status`: draft, ready_for_screening, screened

### Content Value Score

Represents editorial screening criteria.

Scoring dimensions:

- Freshness.
- Importance.
- Rarity.
- Audience interest.
- Visual potential.
- Risk level.

Core fields:

- `editorial_brief_id`
- `freshness_score`
- `importance_score`
- `rarity_score`
- `audience_interest_score`
- `visual_potential_score`
- `risk_score`
- `overall_recommendation`
- `scoring_notes`

### Screening Decision

Represents the editorial decision after reviewing a brief.

Allowed decisions:

- `approved`: enters topic pool.
- `watch`: remains tracked but does not become a topic yet.
- `rejected`: does not enter topic pool.

Core fields:

- `editorial_brief_id`
- `decision`
- `reason`
- `decided_by`
- `decided_at`

### Topic Card

Created only from approved editorial briefs.

Core fields:

- `id`
- `source_editorial_brief_id`
- `working_title`
- `core_question`
- `recommended_format`: news brief, technical explainer, company tracking, policy explainer, industry map, or other
- `key_facts`
- `source_ids`
- `map_context`
- `status`: new, assigned, in_research, in_writing, paused, done

## User Flow

### Add Tracking Object

1. Editor creates a company/project tracking object.
2. Editor enters name, aliases, official URL, region, keywords, excluded terms, languages, and reason for tracking.
3. System suggests query variants.
4. Editor confirms tracking configuration.
5. Object becomes eligible for daily search.

### Daily Search And Signal Extraction

1. System runs web search for each active tracking object.
2. Results are clustered and deduplicated.
3. System classifies signals into technical/project milestone, location/facility change, policy/regulatory change, or non-priority.
4. Non-priority results are stored as low-priority context but do not generate briefs by default.
5. Priority signals generate candidate signals.

### Editorial Brief Generation

1. System creates a brief from each candidate signal.
2. Brief includes fact summary, source list, map/location associations, why it matters, possible content angles, open questions, and risk notes.
3. Brief is shown in an inbox for screening.

### Screening

1. Editor reviews the brief.
2. Editor sees content-value scores and can adjust them.
3. Editor chooses approved, watch, or rejected.
4. Approved briefs become topic cards.
5. Watch and rejected decisions retain reasons to reduce repeated review.

### Topic Pool

1. Topic pool only contains approved briefs.
2. Editors can sort by score, date, tracking object, signal type, region, or recommended format.
3. Topic cards are the handoff point to later content-generation workflows.

## Main Screens

### Tracking Objects

List of tracked companies/projects with status, priority, last search date, new signal count, and configuration health.

### Tracking Object Detail

Profile page for one company/project. Shows search configuration, associated location anchors, recent signals, recent briefs, and topic history.

### Daily Brief Inbox

Primary MVP work surface. Shows new editorial briefs awaiting screening. Each item exposes the summary, sources, map context, signal type, score preview, and action buttons.

### Brief Detail

Deep review page for one brief. Shows facts, citations, source confidence, location anchors, why it matters, possible angles, open questions, and scoring controls.

### Map Context

Map view of confirmed location anchors. Used to understand geography and relationships, not as the first MVP's main workflow.

### Topic Pool

List of approved topic cards. Downstream content generation starts here in a later phase.

## AI Tasks

### Query Suggestion

Given a tracking object, suggest search queries using name, aliases, official terms, region, and likely event vocabulary.

### Signal Classification

Classify results into priority signal types and detect duplicates or repeated coverage.

### Brief Generation

Generate fact-focused editorial briefs with citations and explicit uncertainty.

### Location Extraction

Extract and geocode relevant locations when sources mention headquarters, launch sites, factories, test bases, industrial parks, policy nodes, or regulatory jurisdictions.

### Content Value Scoring

Suggest preliminary scores for freshness, importance, rarity, audience interest, visual potential, and risk level. Editors can override scores.

## Quality And Trust Rules

- Every brief must include sources.
- Official, regulatory, and primary sources should be ranked above secondary reporting.
- AI-generated claims must be tied to a cited source or marked as inference.
- A brief cannot enter the topic pool without a human screening decision.
- Rejected and watch decisions must preserve the reason.
- The UI must show clear confirmation after every editor action.

## Error Handling

- Failed search run: mark run as failed, store error summary, and retry on the next schedule.
- Weak source quality: generate brief with low confidence and require editor review.
- Duplicate signal: link to existing candidate signal or brief instead of generating a new topic.
- Ambiguous location: attach no map anchor until editor confirms.
- Conflicting sources: include conflict in risk notes and lower confidence.

## MVP Success Criteria

- Editors can add and configure tracking objects without developer help.
- Daily search produces reviewable candidate signals.
- Editorial briefs are source-backed and map-aware.
- Editors can screen briefs with content-value scoring.
- Approved briefs reliably enter the topic pool.
- The system reduces repeated manual scanning for tracked aerospace companies/projects.

## Future Phases

### Phase 2: Data Dashboard

Add funding rounds, public-market movements, valuation history, investor relations, and company data cards.

### Phase 3: Content Generation Pipeline

Expand approved topic cards into outlines, scripts, storyboards, voiceover drafts, shot lists, asset tasks, and video production states.

### Phase 4: Rich Intelligence Map

Promote the map into a primary exploration surface with layered filters, relationship views, timelines, and regional intelligence clusters.

### Phase 5: Source Automation

Add source adapters beyond web search, such as official feeds, regulatory databases, company announcements, launch schedules, and specialized aerospace data sources.
