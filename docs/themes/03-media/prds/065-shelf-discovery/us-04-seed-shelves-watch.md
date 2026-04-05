# US-04: "Because you watched" shelf

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want recommendations seeded from specific movies I've watched so I can discover movies related to individual watches, not just my overall profile.

## Acceptance Criteria

- [x] Shelf definition registered with id `because-you-watched`, template: true, category: seed
- [x] `generate()` produces one instance per eligible seed movie
- [x] Seed selection: 60% from last 30 days watches, 40% random older watches
- [x] Maximum 10 instances generated (capped for performance)
- [x] Each instance: title "Because you watched {Movie}", queries TMDB `/movie/{id}/recommendations`
- [x] Results scored by preference profile, dismissed movies filtered
- [x] Instance score derived from seed movie's ELO (higher ELO = more relevant seed)
- [x] Tests: seed rotation mix, instance generation, TMDB query, scoring
