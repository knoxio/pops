# US-04: "Because you watched" shelf

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want recommendations seeded from specific movies I've watched so I can discover movies related to individual watches, not just my overall profile.

## Acceptance Criteria

- [ ] Shelf definition registered with id `because-you-watched`, template: true, category: seed
- [ ] `generate()` produces one instance per eligible seed movie
- [ ] Seed selection: 60% from last 30 days watches, 40% random older watches
- [ ] Maximum 10 instances generated (capped for performance)
- [ ] Each instance: title "Because you watched {Movie}", queries TMDB `/movie/{id}/recommendations`
- [ ] Results scored by preference profile, dismissed movies filtered
- [ ] Instance score derived from seed movie's ELO (higher ELO = more relevant seed)
- [ ] Tests: seed rotation mix, instance generation, TMDB query, scoring
