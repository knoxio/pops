# US-08: Local library shelves

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want discovery shelves from my local library — quick watches, epic films, comfort picks, undiscovered items, and more.

## Acceptance Criteria

- [x] `short-watch` shelf: unwatched, runtime < 100min, scored by profile
- [x] `long-epic` shelf: unwatched, runtime > 150min, scored by profile
- [x] `comfort-picks` shelf: watched 2+ times (count watch_history entries) or frequently draw-high'd in comparisons
- [x] `undiscovered` shelf: in library, unwatched, zero comparisons — movies the user owns but never engaged with
- [x] `polarizing` shelf: movies where `MAX(score) - MIN(score) > 200` across ELO dimensions
- [x] `friend-proof` shelf: high Entertainment + high Rewatchability dimension scores (above 75th percentile in both)
- [x] `recently-added` shelf: newest by created_at, unwatched, limit 20
- [x] `franchise-completions` shelf: uses TMDB `belongs_to_collection` field to find partially watched collections, shows unwatched entries (Note: approximated via genre-overlap until `belongs_to_collection` column is added to schema)
- [x] All shelves: static, category local
- [x] Tests: each shelf query returns correct results, edge cases (empty library, no comparisons)
