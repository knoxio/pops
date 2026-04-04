# US-02: Session assembly algorithm

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As the system, I assemble a discover page per session by scoring, selecting, and ordering shelf instances from the pool.

## Acceptance Criteria

- [ ] `assembleSession(profile, impressions)` returns ordered list of 10-15 ShelfInstances
- [ ] Scoring: relevance (0-1) × freshness (from impressions) × variety bonus (+0.2 if different category)
- [ ] Selection via weighted random sampling — not deterministic top-pick
- [ ] Variety constraints: max 3 seed-based, max 2 genre-related, max 1 local per 3 shelves
- [ ] At least 1 personal shelf (recommendations or because-you-watched) always included
- [ ] Context shelves get +0.3 boost when time triggers are active
- [ ] Shelves with < 3 results discarded during filtering
- [ ] Item jitter: within each shelf, multiply item scores by random [0.8, 1.2] before sorting
- [ ] Tests: variety constraints enforced, freshness reduces repeat shelves, jitter produces different orderings
