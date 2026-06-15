# Aerospace Intelligence Screening MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first internal MVP for an aerospace media intelligence screening desk: tracked company/project objects, daily web-search updates, source-backed editorial briefs, content-value screening, topic-pool handoff, and map context.

**Architecture:** Greenfield web application with a shared domain model first, then three parallel feature streams. Phase 0 freezes database schema, TypeScript types, API contracts, and seed data so the three implementation agents can work independently without inventing incompatible object shapes.

**Tech Stack:** Assumed Next.js App Router, TypeScript, PostgreSQL via Supabase or equivalent, server-side scheduled jobs, OpenAI-compatible LLM calls for extraction/briefing/scoring, Playwright for end-to-end checks, Vitest for unit tests. If the final repo chooses a different stack, keep the same domain boundaries and API contracts.

---

## Development Phases

### Phase 0: Foundation And Contracts

Purpose: create a shared skeleton before parallel development starts.

Deliverables:

- App scaffold.
- Database schema.
- Shared domain types.
- API route contracts.
- Seed fixtures.
- Test framework.
- Basic shell UI with navigation.

Exit criteria:

- Every core entity from the spec has a table or equivalent persisted model.
- Three agents can import the same shared types.
- Seed data includes at least two tracked objects, three sources, three candidate signals, two locations, two briefs, and one approved topic card.

### Phase 1: Parallel Feature Build

Purpose: let three agents implement separable workflows against the shared contracts.

Agents:

- Agent 1: Tracking And Search.
- Agent 2: Briefing And Screening.
- Agent 3: Map And Workbench Experience.

Exit criteria:

- Agent 1 can create tracking objects and produce candidate signals.
- Agent 2 can create editorial briefs, score them, and screen them into topic cards.
- Agent 3 can show location anchors, brief context, and clear UI feedback.

### Phase 2: Integration

Purpose: connect the three feature streams into the approved MVP loop.

Integrated flow:

1. Create a tracked company/project.
2. Run a web-search update.
3. Generate candidate signals for B/C/D change types.
4. Generate editorial briefs.
5. Score and screen the briefs.
6. Move approved briefs into the topic pool.
7. Show associated location context on the map.

Exit criteria:

- A seeded tracked object can complete the full workflow end to end.
- Rejected/watch briefs do not enter the topic pool.
- UI confirms each user action visibly.

### Phase 3: MVP Hardening And Demo

Purpose: make the MVP reliable enough for internal team use.

Deliverables:

- Error states.
- Empty states.
- Loading states.
- Duplicate handling.
- Source confidence display.
- Daily job observability.
- Demo script and seed dataset.

Exit criteria:

- Internal demo can run without manual database edits.
- Playwright covers the full happy path.
- Unit tests cover classification, scoring, and status transitions.

---

## Three-Agent Split

### Agent 1: Tracking And Search

Owns:

- Tracking object library.
- Search configuration.
- Daily search runs.
- Result normalization.
- Source persistence.
- Candidate signal extraction.
- B/C/D signal classification:
  - Technical/project milestone.
  - Location/facility change.
  - Policy/regulatory change.

Must not own:

- Editorial screening decisions.
- Topic-pool creation.
- Map UI.

Primary entities:

- `TrackingObject`
- `SearchRun`
- `Source`
- `CandidateSignal`

Primary API contract:

- `POST /api/tracking-objects`
- `GET /api/tracking-objects`
- `GET /api/tracking-objects/:id`
- `POST /api/tracking-objects/:id/search-runs`
- `GET /api/search-runs/:id`
- `GET /api/candidate-signals?trackingObjectId=...`

Agent acceptance tests:

- Creating a tracking object stores aliases, keywords, excluded terms, regions, languages, and source preferences.
- Running a search stores a `SearchRun`.
- A result about a launch, test, facility, or regulatory event becomes a `CandidateSignal`.
- A financing-only result is stored as low-priority context or ignored for MVP signal generation.
- Duplicate URLs do not create duplicate candidate signals.

### Agent 2: Briefing And Screening

Owns:

- Editorial brief generation.
- Source-backed summary display.
- Content-value score generation and editing.
- Screening decisions.
- Topic-card creation.
- Status transitions.

Must not own:

- Search execution.
- Map rendering.
- Location geocoding UI.

Primary entities:

- `EditorialBrief`
- `ContentValueScore`
- `ScreeningDecision`
- `TopicCard`

Primary API contract:

- `POST /api/candidate-signals/:id/editorial-briefs`
- `GET /api/editorial-briefs?status=ready_for_screening`
- `GET /api/editorial-briefs/:id`
- `PUT /api/editorial-briefs/:id/content-value-score`
- `POST /api/editorial-briefs/:id/screening-decision`
- `GET /api/topic-cards`

Agent acceptance tests:

- A candidate signal can generate one editorial brief.
- Brief generation requires at least one source.
- Scores include freshness, importance, rarity, audience interest, visual potential, and risk level.
- Approved briefs create topic cards.
- Watch and rejected briefs do not create topic cards.
- Decision reason is required for watch and rejected decisions.

### Agent 3: Map And Workbench Experience

Owns:

- Location anchors.
- Map context panel.
- Main workbench UI.
- Brief inbox layout.
- Action feedback.
- End-to-end visual flow.

Must not own:

- Search result classification.
- LLM prompt logic for brief generation.
- Screening business rules beyond calling the API.

Primary entities:

- `LocationAnchor`
- UI state for inbox, detail panels, map context, and action confirmation.

Primary API contract:

- `POST /api/location-anchors`
- `GET /api/location-anchors`
- `GET /api/location-anchors?trackingObjectId=...`
- `PUT /api/editorial-briefs/:id/location-anchors`

Agent acceptance tests:

- Location anchors support the five approved MVP types:
  - Launch site / spaceport.
  - Company headquarters / office.
  - Manufacturing / assembly / supply-chain facility.
  - Test site / test stand / test base.
  - Investor / policy / industrial park node.
- University/research-institute location type is not shown in MVP creation controls.
- Clicking approve/watch/reject shows immediate visible feedback.
- Sending a brief to the topic pool shows a confirmation state.
- Brief detail shows related locations when they exist and a clear empty state when they do not.

---

## Shared Contracts

### Status Enums

```ts
export type TrackingObjectType = "company" | "project";

export type LocationAnchorType =
  | "launch_site"
  | "company_office"
  | "manufacturing_supply_chain"
  | "test_site"
  | "investor_policy_industrial_park";

export type CandidateSignalType =
  | "technical_project_milestone"
  | "location_facility_change"
  | "policy_regulatory_change";

export type NoveltyStatus = "new" | "updated" | "duplicate" | "unclear";

export type BriefStatus = "draft" | "ready_for_screening" | "screened";

export type ScreeningDecisionValue = "approved" | "watch" | "rejected";

export type TopicCardStatus =
  | "new"
  | "assigned"
  | "in_research"
  | "in_writing"
  | "paused"
  | "done";
```

### Core Entity Interfaces

```ts
export interface TrackingObject {
  id: string;
  name: string;
  type: TrackingObjectType;
  aliases: string[];
  countryOrRegion: string;
  officialUrl: string | null;
  primaryTrack: string;
  whyTrack: string;
  keywords: string[];
  excludedTerms: string[];
  languages: string[];
  regions: string[];
  preferredSources: string[];
  searchFrequency: "daily";
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface Source {
  id: string;
  url: string;
  title: string;
  publisher: string | null;
  publishedAt: string | null;
  retrievedAt: string;
  sourceType:
    | "official"
    | "regulator"
    | "authoritative_media"
    | "trade_media"
    | "social_public_post"
    | "database"
    | "other";
  confidence: number;
  notes: string | null;
}

export interface CandidateSignal {
  id: string;
  trackingObjectId: string;
  searchRunId: string;
  signalType: CandidateSignalType;
  headline: string;
  summary: string;
  eventDate: string | null;
  detectedAt: string;
  sourceIds: string[];
  dedupeKey: string;
  noveltyStatus: NoveltyStatus;
  confidence: number;
}

export interface EditorialBrief {
  id: string;
  candidateSignalId: string;
  trackingObjectId: string;
  briefTitle: string;
  factSummary: string;
  sourceSummary: string;
  mapContext: string | null;
  whyItMatters: string;
  possibleAngles: string[];
  openQuestions: string[];
  riskNotes: string[];
  locationAnchorIds: string[];
  status: BriefStatus;
  createdAt: string;
}

export interface ContentValueScore {
  editorialBriefId: string;
  freshnessScore: number;
  importanceScore: number;
  rarityScore: number;
  audienceInterestScore: number;
  visualPotentialScore: number;
  riskScore: number;
  overallRecommendation: "strong" | "medium" | "weak";
  scoringNotes: string;
}

export interface ScreeningDecision {
  editorialBriefId: string;
  decision: ScreeningDecisionValue;
  reason: string;
  decidedBy: string;
  decidedAt: string;
}

export interface TopicCard {
  id: string;
  sourceEditorialBriefId: string;
  workingTitle: string;
  coreQuestion: string;
  recommendedFormat:
    | "news_brief"
    | "technical_explainer"
    | "company_tracking"
    | "policy_explainer"
    | "industry_map"
    | "other";
  keyFacts: string[];
  sourceIds: string[];
  mapContext: string | null;
  status: TopicCardStatus;
}
```

---

## Suggested File Structure

```text
app/
  page.tsx
  tracking-objects/
    page.tsx
    [id]/page.tsx
  briefs/
    page.tsx
    [id]/page.tsx
  topic-pool/
    page.tsx
  map/
    page.tsx
  api/
    tracking-objects/route.ts
    tracking-objects/[id]/route.ts
    tracking-objects/[id]/search-runs/route.ts
    search-runs/[id]/route.ts
    candidate-signals/route.ts
    candidate-signals/[id]/editorial-briefs/route.ts
    editorial-briefs/route.ts
    editorial-briefs/[id]/route.ts
    editorial-briefs/[id]/content-value-score/route.ts
    editorial-briefs/[id]/screening-decision/route.ts
    editorial-briefs/[id]/location-anchors/route.ts
    topic-cards/route.ts
    location-anchors/route.ts
components/
  app-shell.tsx
  tracking-object-form.tsx
  tracking-object-list.tsx
  brief-inbox.tsx
  brief-detail.tsx
  content-value-score-form.tsx
  screening-actions.tsx
  topic-card-list.tsx
  map-context-panel.tsx
  action-feedback.tsx
lib/
  domain/types.ts
  domain/status.ts
  domain/scoring.ts
  domain/signal-classification.ts
  search/query-builder.ts
  search/result-normalizer.ts
  search/dedupe.ts
  ai/brief-generator.ts
  ai/score-generator.ts
  db/client.ts
  db/repositories/
    tracking-objects.ts
    search-runs.ts
    sources.ts
    candidate-signals.ts
    editorial-briefs.ts
    scores.ts
    screening-decisions.ts
    topic-cards.ts
    location-anchors.ts
tests/
  unit/
    signal-classification.test.ts
    scoring.test.ts
    screening-transition.test.ts
    dedupe.test.ts
  e2e/
    mvp-flow.spec.ts
supabase/
  migrations/
    0001_initial_schema.sql
  seed.sql
docs/
  superpowers/
    specs/
      2026-06-07-aerospace-intelligence-screening-design.md
    plans/
      2026-06-07-aerospace-intelligence-screening-development-plan.md
```

---

## Phase 0 Tasks: Foundation

### Task 0.1: Scaffold Application

**Files:**

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `app/page.tsx`
- Create: `components/app-shell.tsx`
- Create: `lib/domain/types.ts`

- [ ] **Step 1: Initialize a Next.js TypeScript app**

Run:

```bash
npx create-next-app@latest . --ts --app --eslint
```

Expected:

```text
Success! Created ...
```

- [ ] **Step 2: Add shared type file**

Create `lib/domain/types.ts` using the interfaces in the Shared Contracts section of this plan.

- [ ] **Step 3: Add base shell**

Create `components/app-shell.tsx`:

```tsx
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/tracking-objects", label: "Tracking" },
  { href: "/briefs", label: "Brief Inbox" },
  { href: "/topic-pool", label: "Topic Pool" },
  { href: "/map", label: "Map" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
          <Link href="/" className="font-semibold">
            Aerospace Intelligence
          </Link>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-zinc-600">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Add home page**

Create `app/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-semibold">Aerospace Intelligence Screening</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-600">
        Track aerospace companies and projects, review daily search signals, screen editorial briefs, and move approved items into the topic pool.
      </p>
    </AppShell>
  );
}
```

- [ ] **Step 5: Run app**

Run:

```bash
npm run dev
```

Expected:

```text
Ready
```

### Task 0.2: Add Database Schema And Seed Data

**Files:**

- Create: `supabase/migrations/0001_initial_schema.sql`
- Create: `supabase/seed.sql`
- Create: `lib/db/client.ts`

- [ ] **Step 1: Create schema migration**

Create tables matching these names:

```sql
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
  type text not null check (type in ('launch_site', 'company_office', 'manufacturing_supply_chain', 'test_site', 'investor_policy_industrial_park')),
  latitude double precision,
  longitude double precision,
  country_or_region text not null,
  description text,
  related_tracking_object_ids uuid[] not null default '{}',
  source_ids uuid[] not null default '{}',
  confidence numeric not null default 0.5
);

create table search_runs (
  id uuid primary key default gen_random_uuid(),
  tracking_object_id uuid not null references tracking_objects(id),
  run_date date not null default current_date,
  query_set text[] not null default '{}',
  status text not null default 'pending',
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
  source_type text not null default 'other',
  confidence numeric not null default 0.5,
  notes text
);

create table candidate_signals (
  id uuid primary key default gen_random_uuid(),
  tracking_object_id uuid not null references tracking_objects(id),
  search_run_id uuid not null references search_runs(id),
  signal_type text not null check (signal_type in ('technical_project_milestone', 'location_facility_change', 'policy_regulatory_change')),
  headline text not null,
  summary text not null,
  event_date date,
  detected_at timestamptz not null default now(),
  source_ids uuid[] not null default '{}',
  dedupe_key text not null,
  novelty_status text not null default 'new',
  confidence numeric not null default 0.5,
  unique (tracking_object_id, dedupe_key)
);

create table editorial_briefs (
  id uuid primary key default gen_random_uuid(),
  candidate_signal_id uuid not null references candidate_signals(id),
  tracking_object_id uuid not null references tracking_objects(id),
  brief_title text not null,
  fact_summary text not null,
  source_summary text not null,
  map_context text,
  why_it_matters text not null,
  possible_angles text[] not null default '{}',
  open_questions text[] not null default '{}',
  risk_notes text[] not null default '{}',
  location_anchor_ids uuid[] not null default '{}',
  status text not null default 'ready_for_screening',
  created_at timestamptz not null default now(),
  unique (candidate_signal_id)
);

create table content_value_scores (
  editorial_brief_id uuid primary key references editorial_briefs(id),
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
  editorial_brief_id uuid primary key references editorial_briefs(id),
  decision text not null check (decision in ('approved', 'watch', 'rejected')),
  reason text not null,
  decided_by text not null,
  decided_at timestamptz not null default now()
);

create table topic_cards (
  id uuid primary key default gen_random_uuid(),
  source_editorial_brief_id uuid not null unique references editorial_briefs(id),
  working_title text not null,
  core_question text not null,
  recommended_format text not null,
  key_facts text[] not null default '{}',
  source_ids uuid[] not null default '{}',
  map_context text,
  status text not null default 'new'
);
```

- [ ] **Step 2: Add seed fixtures**

Create `supabase/seed.sql` with two tracking objects and one complete approved flow. Use real-looking but clearly internal sample data such as Stoke Space and Starbase, with source URLs that can be replaced later.

- [ ] **Step 3: Add database client wrapper**

Create `lib/db/client.ts`:

```ts
export function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}
```

---

## Phase 1 Parallel Tasks

### Agent 1 Task: Tracking And Search

- [ ] Build tracking object list and creation form.
- [ ] Implement query builder from object aliases, keywords, excluded terms, languages, and regions.
- [ ] Implement mocked web-search provider first so tests do not depend on network.
- [ ] Implement result normalizer and URL dedupe.
- [ ] Implement signal classifier for B/C/D types.
- [ ] Add API routes for tracking objects, search runs, and candidate signals.
- [ ] Add unit tests for query builder, dedupe, and signal classification.

Key test cases:

```ts
import { classifySignal } from "@/lib/domain/signal-classification";

it("classifies engine hot-fire as a technical milestone", () => {
  expect(classifySignal("Stoke Space completes full-duration engine hot-fire test")).toBe("technical_project_milestone");
});

it("classifies spaceport license as policy regulatory change", () => {
  expect(classifySignal("FAA grants launch license for commercial spaceport operation")).toBe("policy_regulatory_change");
});

it("does not classify funding news as an MVP candidate signal", () => {
  expect(classifySignal("Company raises Series B funding")).toBe(null);
});
```

### Agent 2 Task: Briefing And Screening

- [ ] Build brief-generation service from candidate signal and sources.
- [ ] Require at least one source before brief creation.
- [ ] Build content-value scoring service.
- [ ] Implement brief inbox and brief detail pages.
- [ ] Implement screening decision API.
- [ ] Implement topic-card creation only for approved decisions.
- [ ] Add unit tests for score validation and screening transitions.

Key test cases:

```ts
import { applyScreeningDecision } from "@/lib/domain/screening-transition";

it("creates a topic card when a brief is approved", () => {
  const result = applyScreeningDecision({
    decision: "approved",
    briefTitle: "Reusable rocket test advances",
    factSummary: "The company completed a test.",
    sourceIds: ["source-1"],
    mapContext: "Test site in Washington",
  });
  expect(result.topicCard?.workingTitle).toBe("Reusable rocket test advances");
});

it("does not create a topic card when a brief is rejected", () => {
  const result = applyScreeningDecision({
    decision: "rejected",
    briefTitle: "Low-confidence signal",
    factSummary: "Only one weak source mentions the event.",
    sourceIds: ["source-1"],
    mapContext: null,
  });
  expect(result.topicCard).toBeNull();
});
```

### Agent 3 Task: Map And Workbench Experience

- [ ] Build location-anchor CRUD for the five approved MVP types.
- [ ] Exclude university/research-institute from location creation controls.
- [ ] Build map context panel that works before a full map library is integrated.
- [ ] Build visible action feedback component for approve/watch/reject and send-to-topic-pool actions.
- [ ] Add brief detail UI with source list, score controls, location context, and action buttons.
- [ ] Add Playwright happy-path test for create tracking object, run search, screen brief, and see topic card.

Key test cases:

```ts
import { allowedLocationAnchorTypes } from "@/lib/domain/status";

it("does not include research institute as an MVP location type", () => {
  expect(allowedLocationAnchorTypes).not.toContain("research_institute");
});
```

---

## Phase 2 Integration Tasks

- [ ] Connect Agent 1 candidate signals to Agent 2 brief generation.
- [ ] Connect Agent 2 approved topic cards to Agent 3 topic-pool UI.
- [ ] Connect Agent 3 location anchors to brief detail and tracking object detail.
- [ ] Add an end-to-end seed flow that starts with a company/project tracking object and ends with an approved topic card.
- [ ] Verify rejected and watch decisions do not create topic cards.
- [ ] Verify all editor actions show visible feedback within the page.

Integration test outline:

```ts
import { test, expect } from "@playwright/test";

test("editor screens a daily signal into a topic card", async ({ page }) => {
  await page.goto("/tracking-objects");
  await page.getByRole("button", { name: "New tracking object" }).click();
  await page.getByLabel("Name").fill("Stoke Space");
  await page.getByLabel("Why track").fill("Reusable launch vehicle project with technical milestone signals.");
  await page.getByRole("button", { name: "Create tracking object" }).click();
  await expect(page.getByText("Tracking object created")).toBeVisible();

  await page.getByRole("button", { name: "Run daily search" }).click();
  await expect(page.getByText("Search run completed")).toBeVisible();

  await page.goto("/briefs");
  await page.getByRole("link", { name: /Reusable/i }).click();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Brief approved and sent to topic pool")).toBeVisible();

  await page.goto("/topic-pool");
  await expect(page.getByText(/Reusable/i)).toBeVisible();
});
```

---

## Phase 3 Hardening Tasks

- [ ] Add loading and empty states to tracking object list, brief inbox, map context, and topic pool.
- [ ] Add error states for failed search, missing sources, ambiguous locations, duplicate signals, and conflicting sources.
- [ ] Add source-confidence badges.
- [ ] Add run log page or panel for daily web-search status.
- [ ] Add demo dataset and internal walkthrough script.
- [ ] Run full unit and end-to-end test suite.

Verification commands:

```bash
npm run lint
npm run test
npm run test:e2e
```

Expected:

```text
All tests pass
```

---

## Recommended Work Order

1. Finish Phase 0 in the main session.
2. Dispatch three agents in parallel for Phase 1.
3. Review each agent's changes before integration.
4. Merge Agent 1 first, Agent 2 second, Agent 3 third.
5. Run Phase 2 integration as a single coordinated pass.
6. Run Phase 3 hardening after the end-to-end flow works.

## Plan Self-Review

- Spec coverage: the plan covers tracking objects, daily search, B/C/D signals, editorial briefs, content-value scoring, screening decisions, topic pool, map context, and clear UI feedback.
- Scope control: funding/public-market dashboard, university/research location type, full content generation, large OSINT monitoring, and Crucix fork are excluded.
- Agent boundaries: Agent 1 owns signals, Agent 2 owns screening, Agent 3 owns map/UI feedback. Shared contracts are defined before parallel development.
- Current limitation: the workspace is not yet a git repository, so commit steps are not included as mandatory checkpoints until a repo exists.
