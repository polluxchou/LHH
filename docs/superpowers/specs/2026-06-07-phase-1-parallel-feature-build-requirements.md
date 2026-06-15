# Phase 1 Parallel Feature Build Requirements

## Objective

Phase 1 turns the Phase 0 foundation into a usable internal MVP slice. It adds three functional work areas that can be developed independently against the shared domain model:

1. Tracking and search.
2. Briefing and screening.
3. Map and workbench experience.

Phase 1 should let an editor understand the product flow using deterministic local fixtures and mocked search/AI services. Real web-search providers, persistent database repositories, authentication, scheduled jobs, and production LLM calls are reserved for Phase 2 or later integration work.

## Phase 1 Product Loop

The implemented local loop should support:

1. View tracked company/project objects.
2. Create a new company/project tracking object in UI state.
3. Run a mocked daily search for a tracking object.
4. Produce candidate signals for MVP signal types.
5. View editorial briefs in an inbox.
6. Review content-value scores.
7. Approve, watch, or reject a brief with immediate visible feedback.
8. See approved briefs represented as topic cards.
9. See location anchors and map context for briefs and tracking objects.

## Agent 1: Tracking And Search Requirements

### Scope

Agent 1 owns tracking objects, mocked daily search, source normalization, dedupe, and candidate signal classification.

### Required Capabilities

- Render a tracking object list from local seed data.
- Render a creation form for company/project tracking objects.
- Preserve aliases, keywords, excluded terms, languages, regions, preferred sources, priority, and reason for tracking.
- Build query strings from a tracking object.
- Normalize mocked search results into `Source` records.
- Classify only these candidate signal types:
  - `technical_project_milestone`
  - `location_facility_change`
  - `policy_regulatory_change`
- Ignore funding-only and people/team-only signals for MVP candidate generation.
- Deduplicate by canonical URL and by tracking-object/dedupe-key.
- Expose local API handlers or service functions matching the planned route contracts.

### Acceptance Criteria

- Creating a tracking object keeps all configured fields.
- Running mocked search creates a `SearchRun`.
- Search results about launch, test, facility, or regulatory changes become candidate signals.
- Funding-only results do not become candidate signals.
- Duplicate URLs do not create duplicate sources.

## Agent 2: Briefing And Screening Requirements

### Scope

Agent 2 owns editorial briefs, source-backed summaries, content-value scores, screening decisions, and topic-card creation.

### Required Capabilities

- Generate one editorial brief from a candidate signal and at least one source.
- Refuse to generate a brief if a candidate signal has no source.
- Generate deterministic local brief copy using signal and source data.
- Generate or display content-value scores across:
  - Freshness.
  - Importance.
  - Rarity.
  - Audience interest.
  - Visual potential.
  - Risk level.
- Render a brief inbox.
- Render a brief detail surface with facts, sources, why it matters, possible angles, open questions, risk notes, and score controls/readout.
- Support `approved`, `watch`, and `rejected` decisions.
- Create topic cards only for approved briefs.
- Require a decision reason for watch and rejected decisions.

### Acceptance Criteria

- A sourced candidate signal can produce an editorial brief.
- A source-less candidate signal cannot produce an editorial brief.
- Approved decisions create topic cards.
- Watch and rejected decisions do not create topic cards.
- The UI gives clear confirmation after approve/watch/reject.

## Agent 3: Map And Workbench Experience Requirements

### Scope

Agent 3 owns location anchors, map context display, main workbench layout, and visible action feedback.

### Required Capabilities

- Render the five approved MVP location anchor types:
  - Launch site / spaceport.
  - Company headquarters / office.
  - Manufacturing / assembly / supply-chain facility.
  - Test site / test stand / test base.
  - Investor / policy / industrial park node.
- Exclude university/research-institute from creation controls and visible type filters.
- Render a map context panel without requiring a full map library.
- Show related location anchors for a tracking object or brief.
- Show empty states when no locations exist.
- Provide an action-feedback component for editor actions.
- Make button/selection feedback visually obvious.

### Acceptance Criteria

- The map page lists location anchors grouped by MVP type.
- Brief detail can display related locations.
- The UI never offers a university/research-institute type.
- Approve/watch/reject interactions produce visible confirmation text.

## Shared Implementation Constraints

- Use the Phase 0 TypeScript domain types instead of inventing new object shapes.
- Keep mocked services deterministic so tests do not require network access.
- Keep data local for Phase 1. Persistent DB integration is a Phase 2 concern.
- Do not add real LLM calls.
- Do not add real web-search calls.
- Do not add auth.
- Do not add full map rendering.

## Required Tests

Phase 1 must add or maintain unit tests for:

- Search query building.
- URL/source dedupe.
- Signal classification.
- Brief generation requires sources.
- Screening transition rules.
- Allowed location types.
- Content-value scoring.

## Required Verification

Run:

```bash
npm run test
npm run lint
npm run build
```

All commands must pass before Phase 1 is considered complete.
