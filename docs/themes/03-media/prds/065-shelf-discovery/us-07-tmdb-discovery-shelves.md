# US-07: TMDB discovery shelves

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want discovery shelves sourced from TMDB's broader catalog — new releases, upcoming releases, hidden gems, critically acclaimed, award winners, and decade picks.

## Acceptance Criteria

- [x] `new-releases` shelf: TMDB discover, released in last 30 days, filtered by top genre affinities
- [x] `upcoming-releases` shelf: TMDB discover, release date between today and +90 days, sorted by release date ascending; surfaces upcoming content on the Discover page (resolves the `/media/calendar` 404)
- [x] `hidden-gems` shelf: TMDB discover, vote count 50-500, vote average > 7.0, top genres
- [x] `critics-vs-audiences` shelf: TMDB discover, high vote average + low popularity as polarization proxy
- [x] `award-winners` shelf: TMDB discover with keywords (academy award, golden globe), filtered by genre
- [x] `decade-picks` shelf: title "Best of the {Decade}", year range of decade with most user watches, TMDB discover
- [x] All shelves: static (not template), category tmdb
- [x] All results scored by preference profile, dismissed filtered, library-owned flagged
- [x] Tests: each shelf produces results, filters work, scoring applied
- [x] `/media/calendar` route redirects to `/media/discover` (no more 404)
