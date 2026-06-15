# Phase 0 Foundation Requirements

## Objective

Phase 0 creates the shared foundation for the aerospace intelligence screening MVP. Its job is to make later parallel development possible by freezing the domain vocabulary, project skeleton, database schema, seed data, and verification baseline.

Phase 0 does not implement daily web search, AI brief generation, map rendering, or real editorial screening workflows. It only creates the contracts those features will use.

## Required Outcomes

By the end of Phase 0:

1. The repository has a runnable Next.js TypeScript application skeleton.
2. The application has a basic shell with navigation for Tracking, Brief Inbox, Topic Pool, and Map.
3. Shared TypeScript domain types exist for all MVP entities.
4. Shared status enums and allowed location types exist.
5. Unit tests verify the most important domain constraints.
6. PostgreSQL/Supabase schema exists for all MVP entities.
7. Seed SQL includes a small complete demo data set.
8. The app can be linted and tested locally after dependencies are installed.

## Domain Scope

Phase 0 must define these entities:

- Tracking Object.
- Location Anchor.
- Search Run.
- Source.
- Candidate Signal.
- Editorial Brief.
- Content Value Score.
- Screening Decision.
- Topic Card.

## MVP Constraints To Encode

### Tracking Object

The first tracking object type is company/project, not a generic topic or location.

Allowed values:

- `company`
- `project`

### Candidate Signal

Only three signal types are in MVP scope:

- Technical/project milestone.
- Location/facility change.
- Policy/regulatory change.

Funding, public market data, and people/team changes are not Phase 0 priority signal types.

### Location Anchor

Allowed MVP location types:

- Launch site / spaceport.
- Company headquarters / office.
- Manufacturing / assembly / supply-chain facility.
- Test site / test stand / test base.
- Investor / policy / industrial park node.

University/research-institute location type is explicitly excluded from MVP creation controls.

### Screening Decision

Allowed decisions:

- `approved`
- `watch`
- `rejected`

Only approved briefs can become topic cards in later phases.

## Required Files

Project files:

- `package.json`
- `tsconfig.json`
- `next.config.ts`
- `app/layout.tsx`
- `app/page.tsx`
- `components/app-shell.tsx`

Domain files:

- `lib/domain/types.ts`
- `lib/domain/status.ts`
- `lib/domain/scoring.ts`

Database files:

- `lib/db/client.ts`
- `supabase/migrations/0001_initial_schema.sql`
- `supabase/seed.sql`

Test files:

- `vitest.config.ts`
- `tests/unit/status.test.ts`
- `tests/unit/scoring.test.ts`

## Required Verification

After dependencies are installed:

```bash
npm run test
npm run lint
```

Expected result:

```text
All tests pass and lint completes without errors.
```

## Non-Goals

Phase 0 must not implement:

- Real web search.
- Scheduled jobs.
- LLM calls.
- Brief generation.
- Screening APIs.
- Topic card creation APIs.
- Interactive map library.
- Authentication.
- Deployment configuration.

## Known Workspace Constraint

The current workspace is not a git repository at the start of Phase 0, so worktree and commit checkpoints are unavailable unless the repository is initialized later.
