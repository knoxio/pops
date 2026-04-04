# US-08: Arena action bar

> PRD: [062 — Comparison Intelligence](README.md)
> Status: Done

## Description

As a user, I want a unified action bar below the comparison cards with all arena actions so I can skip, mark stale, exclude, or purge without leaving the flow.

## Acceptance Criteria

- [x] Bottom action bar with the following actions:
  - **Skip** — applies per-pair cooloff (US-04), loads next pair, no comparison recorded
  - **Stale (A)** — marks movie A as stale (US-02), loads next pair, no comparison recorded
  - **Stale (B)** — marks movie B as stale (US-02), loads next pair, no comparison recorded
  - **N/A** — excludes both movies from current dimension (US-03), loads next pair, no comparison recorded
  - **Not watched (A)** — blacklists movie A's watch history (US-01), confirmation dialog, loads next pair
  - **Not watched (B)** — blacklists movie B's watch history (US-01), confirmation dialog, loads next pair
  - **Done** — navigates away from arena
- [x] Watchlist bookmark button stays on each movie card. Does NOT submit a comparison or affect the selection algorithm
- [x] Center column between cards shows High/Mid/Low draw tier buttons
- [x] "Stale" buttons show current staleness level for each movie (e.g. "Stale ×2" if marked before)
- [x] "Not watched" buttons use destructive styling (red) and trigger a confirmation dialog showing comparison count to be purged
- [x] All action bar buttons are disabled while a mutation is pending
- [x] Each action invalidates the pair cache and loads a fresh pair after completing
- [x] On mobile, secondary actions (N/A, Not watched) collapse into a "more" menu. Skip and Stale are always visible
- [x] Tests: each button calls the correct mutation, confirmation dialog for destructive actions, button states

## Notes

This is the final integration point — build it last. It depends on US-01 (blacklist), US-02 (staleness), US-03 (dimension exclusion), and US-04 (skip cooloff) for the underlying mutations.
