# Screening Decision & Topic Card Persistence

**Date:** 2026-06-17
**Status:** Implemented (retroactively documented). Migration `0010_screening_topic_persistence.sql`; commits `5b0ec4d` (persistence) + `50dac51` (wiring).

## Problem

After「通过·入选题库」(approve), the resulting **topic card**(选题) and its
**screening decision** lived only in the in-memory store. `getSpaceContent` did
**not read** `topic_cards` / `screening_decisions`, and no mutation **wrote**
them. So on refresh the runtime-created topic card disappeared (and any article
generated on it with it). The demo space's seeded topics survived only because
they came from the in-memory fixtures overlay, not from the DB.

The two tables existed (since `0001`) but were unused at runtime — and they were
missing columns the domain model carries.

## Decision

Make the screening → pool lifecycle DB-backed: add the missing columns, read both
tables in `getSpaceContent`, write them on decide/observe/claim, and merge DB rows
with the demo overlay additively (so the seeded demo is unchanged and runtime rows
persist).

## Data model — migration `0010`

- `topic_cards`: add `owner_id text`, `observation_dimensions text[] default '{}'`,
  `format_label text` (the 0001 table lacked all three).
- `screening_decisions`: add `observation_dimensions text[] default '{}'` and
  `space_id uuid` (0003 had skipped this table — it was overlay-only). Backfill
  `space_id` from each decision's `editorial_brief`; set NOT NULL; add index; enable
  RLS with a member/owner SELECT policy (same contract as 0003). Writes via
  service-role.

## Writes (`content-mutations.ts`, service-role, membership-checked)

- `persistScreeningDecision(input)`: upsert `screening_decisions` (PK
  `editorial_brief_id`) with decision/reason/observation_dimensions/space_id/
  decided_by; for `approved`, also upsert `topic_cards` (on conflict
  `source_editorial_brief_id`). Space resolved from the editorial brief.
- `persistTopicCardOwner(sourceEditorialBriefId, ownerId)`: claim → update
  `topic_cards.owner_id`. Keyed by `source_editorial_brief_id` (stable; the
  in-memory `topic-${id}` differs from the DB uuid before a refresh).

## Reads & merge

- `getSpaceContent`: selects `screening_decisions` + `topic_cards`, maps to domain.
- `build-space-state`: base `screeningDecisions`/`topicCards` come from the DB.
  For the **demo space** only, the fixtures overlay is kept for seeded rows and DB
  rows **not already present** are appended — deduped by `editorialBriefId`
  (decisions) / `sourceEditorialBriefId` (cards). Overlay ids are `fid()`-derived
  uuids equal to the seeded DB rows, and runtime rows have fresh uuids, so there is
  no double-counting.
- `workflow-provider`: `decide` / `observeWithDimensions` / `claim` commit
  in-memory, then call the persist actions; failures log a `decisionNotPersisted`
  warning (in-memory state still holds for the session).

## Wiring with the screening reducer

`screenBrief` → `applyScreeningTransition` already builds the decision (+ topic card
for `approved`) in memory; the persist actions write the same fields the reducer
produced, so the DB row matches what the UI shows. Brief status for a generated
brief is `ready_for_screening`; topic-card statuses use the existing 0001 enum.

## Rollout & rollback

- **Rollout:** apply `0010` in the Supabase SQL Editor **before** deploying the
  code (the new reads/writes reference columns/policy that don't exist until then).
  Migration is additive + idempotent (`add column if not exists`, backfill only
  `where … is null`).
- **Graceful degradation:** if the code somehow runs before `0010`, the writes
  return `{ok:false}` and are logged; the in-memory order/decision still works for
  the session.
- **Rollback:** revert the read/write/merge code. The added columns are additive and
  can be left in place (harmless) or dropped later; no data migration to reverse.

## Out of scope

- Article-draft persistence (owned by the article session; needs its own table).
