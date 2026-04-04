# US-07: TMDB discovery shelves

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want discovery shelves sourced from TMDB's broader catalog — new releases, hidden gems, critically acclaimed, award winners, and decade picks.

## Acceptance Criteria

- [ ] `new-releases` shelf: TMDB discover, released in last 30 days, filtered by top genre affinities
- [ ] `hidden-gems` shelf: TMDB discover, vote count 50-500, vote average > 7.0, top genres
- [ ] `critics-vs-audiences` shelf: TMDB discover, high vote average + low popularity as polarization proxy
- [ ] `award-winners` shelf: TMDB discover with keywords (academy award, golden globe), filtered by genre
- [ ] `decade-picks` shelf: title "Best of the {Decade}", year range of decade with most user watches, TMDB discover
- [ ] All shelves: static (not template), category tmdb
- [ ] All results scored by preference profile, dismissed filtered, library-owned flagged
- [ ] Tests: each shelf produces results, filters work, scoring applied
