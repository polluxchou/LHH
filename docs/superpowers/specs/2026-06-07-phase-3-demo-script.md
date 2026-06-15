# Phase 3 Internal Demo Script

## Goal

Demonstrate the hardened local MVP loop for the aerospace intelligence screening desk.

## Setup

1. Run the app:

```bash
npm run dev
```

2. Open:

```text
http://localhost:3000/
```

## Walkthrough

1. Confirm the page headline says `Integrated intelligence workflow` and the label says `Phase 3 Hardened Demo`.
2. In `Tracked objects`, select `Stoke Space`.
3. In `Search run`, click `Run mocked daily search`.
4. Confirm success feedback appears and the `Run log` has a `search completed` entry.
5. In `Candidate signals`, click `Open existing brief` for the engine hot-fire signal.
6. Confirm duplicate handling feedback appears and the `Run log` has a `duplicate brief detected` entry.
7. Select the ready `Starbase` tracking object.
8. Confirm map context shows the Starbase launch-site anchor.
9. In `Search run`, click `Simulate failed search`.
10. Confirm warning feedback appears and the `Run log` has a `search failed` entry.
11. In `Brief queue`, review the active brief.
12. Confirm `Source confidence` shows title, publisher, source type, URL, and confidence percentage.
13. Click `Approve` on an unscreened brief.
14. Confirm feedback says the brief entered the local topic pool.
15. Confirm `Topic pool` shows a topic card.
16. Confirm the screened brief becomes read-only.

## Expected Notes To Explain

- This is still a deterministic local MVP.
- Search is mocked.
- Brief generation is deterministic and source-backed.
- Topic-pool updates are local state only.
- Failed search is simulated for observability and demo readiness.
- Real web search, database persistence, scheduling, and LLM calls are later integration work.
