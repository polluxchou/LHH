# Phase 3 Hardening And Demo Requirements

## Objective

Phase 3 makes the local MVP reliable enough for an internal walkthrough. It hardens the Phase 2 integrated workflow with visible operational state, source-confidence display, empty/error states, duplicate handling, and a repeatable demo script.

Phase 3 must not add real web search, real LLM calls, authentication, deployment, or database persistence.

## Required Product Improvements

### Run Log And Observability

The integrated workflow must keep a local run log with timestamped entries for:

- Initial fixture load.
- Tracking-object selection.
- Mocked daily search success.
- Mocked daily search failure simulation.
- Brief generation.
- Duplicate brief detection.
- Screening decisions.
- Workflow errors.

The UI must expose the run log in the integrated workbench.

### Error States

The workflow must support a deterministic failed-search transition for demo and testing. A failed search must:

- Create a failed `SearchRun`.
- Preserve existing candidate signals.
- Show warning feedback.
- Add a run-log entry.

UI actions that throw workflow errors must show warning feedback instead of breaking the page.

### Duplicate Handling

When an editor tries to generate a brief for a signal that already has a brief:

- Do not create another brief.
- Focus or keep the existing brief active.
- Show clear feedback.
- Add a run-log entry.

### Source Confidence Display

The active brief must show its related sources with:

- Source title.
- Publisher.
- Source type.
- Confidence percentage.
- URL.

If a brief has no related sources, the UI must show a clear empty state.

### Empty States

The integrated workbench must show explicit empty states for:

- No candidate signals.
- No briefs.
- No topic cards.
- No map context.
- No sources for a brief.

### Demo Script

Add an internal demo script that walks through:

1. Open the integrated workbench.
2. Select `Stoke Space`.
3. Run mocked daily search.
4. Generate or open the facility-change brief.
5. Approve an unscreened brief.
6. Confirm a topic card appears.
7. Select `Starbase`.
8. Simulate failed search.
9. Confirm warning feedback and run-log entry.
10. Confirm map context and source-confidence panels are visible.

## Required Tests

Add or update tests for:

- Initial state includes a run-log entry.
- Successful mocked search appends a success run-log entry.
- Failed mocked search creates failed `SearchRun`, warning feedback, and error log.
- Duplicate brief generation does not change brief count and logs duplicate handling.
- Source lookup for an active brief returns matching sources with confidence values.

## Required Verification

Run:

```bash
npm run test
npm run lint
npm run build
```

All commands must pass before Phase 3 is considered complete.
