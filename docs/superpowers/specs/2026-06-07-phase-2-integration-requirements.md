# Phase 2 Integration Requirements

## Objective

Phase 2 connects the Phase 1 feature slices into one end-to-end local workflow. The MVP should let an editor start from a tracked company/project, run a mocked daily search, review candidate signals, generate source-backed editorial briefs, screen a brief, create a topic card for approved items, and see map context in the same integrated workbench.

Phase 2 is still local and deterministic. It must not add real web-search calls, real LLM calls, authentication, production scheduling, or database persistence.

## Product Flow

The integrated workflow must support:

1. Select a tracked company/project.
2. Run a mocked daily search for the selected object.
3. Display the resulting search run with query count, result count, and candidate-signal count.
4. Display candidate signals for the selected object.
5. Generate a source-backed editorial brief from a candidate signal.
6. Display generated and fixture editorial briefs in a screening queue.
7. Approve, watch, or reject an unscreened brief.
8. Create a topic card only when the decision is approved.
9. Keep watch and rejected briefs out of the topic pool.
10. Mark screened briefs read-only after a decision.
11. Display related map/location anchors for the selected tracking object and active brief.

## Local State Requirements

Phase 2 must introduce a single local workflow state that owns:

- Tracking objects.
- Search runs.
- Sources.
- Candidate signals.
- Editorial briefs.
- Content-value scores.
- Screening decisions.
- Topic cards.
- Location anchors.
- Currently selected tracking object.
- Last action feedback.

The state can live entirely in React component state for Phase 2, but transition logic should be implemented in testable TypeScript functions.

## Transition Rules

### Run Mocked Search

When the editor runs search for a selected tracking object:

- Create or update a completed `SearchRun`.
- Use `buildTrackingObjectQueries` for the query set.
- Count candidate signals associated with the selected object.
- Surface visible feedback.

### Generate Brief

When the editor generates a brief from a candidate signal:

- Use matching `Source` records only.
- Use `generateEditorialBrief`.
- Attach related `LocationAnchor` ids when known.
- Do not create duplicate briefs for the same candidate signal.
- Surface visible feedback.

### Screen Brief

When the editor screens an unscreened brief:

- Use `applyScreeningTransition`.
- Store a `ScreeningDecision`.
- Mark the brief as `screened`.
- If approved, append the generated `TopicCard`.
- If watch or rejected, do not append a topic card.
- Surface visible feedback.
- Do not allow already-screened briefs to be screened again.

## UI Requirements

Create an integrated workbench visible from the home page or a dedicated route. It must show:

- Selected tracking object controls.
- Search run panel.
- Candidate signal list.
- Brief screening queue.
- Topic pool panel.
- Map context panel.
- Clear action feedback after search, brief generation, and screening.

The workbench should use the existing Phase 1 components where practical, but it may add integration-specific components if the existing components are static.

## Required Tests

Add unit tests for the local workflow transition functions:

- Initial workflow state contains fixtures.
- Running search for a tracking object produces a completed search run.
- Generating a brief from a candidate signal creates one brief and avoids duplicates.
- Approving an unscreened brief marks it screened and appends a topic card.
- Watching or rejecting a brief marks it screened and does not append a topic card.
- Attempting to screen an already-screened brief throws a clear error.

## Required Verification

Run:

```bash
npm run test
npm run lint
npm run build
```

All commands must pass before Phase 2 is considered complete.
