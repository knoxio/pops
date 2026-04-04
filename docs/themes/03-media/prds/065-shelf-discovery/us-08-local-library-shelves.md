# US-08: Local library shelves

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want discovery shelves from my local library — quick watches, epic films, comfort picks, undiscovered items, and more.

## Acceptance Criteria

- [ ] `short-watch` shelf: unwatched, runtime < 100min, scored by profile
- [ ] `long-epic` shelf: unwatched, runtime > 150min, scored by profile
- [ ] `comfort-picks` shelf: watched 2+ times (count watch_history entries) or frequently draw-high'd in comparisons
- [ ] `undiscovered` shelf: in library, unwatched, zero comparisons — movies the user owns but never engaged with
- [ ] `polarizing` shelf: movies where `MAX(score) - MIN(score) > 200` across ELO dimensions
- [ ] `friend-proof` shelf: high Entertainment + high Rewatchability dimension scores (above 75th percentile in both)
- [ ] `recently-added` shelf: newest by created_at, unwatched, limit 20
- [ ] `franchise-completions` shelf: uses TMDB `belongs_to_collection` field to find partially watched collections, shows unwatched entries
- [ ] All shelves: static, category local
- [ ] Tests: each shelf query returns correct results, edge cases (empty library, no comparisons)
