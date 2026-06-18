# US-09: Migrate existing sections to shelf definitions

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a developer, I want the current 9 hardcoded discover sections re-registered as shelf definitions so the pool includes all existing functionality.

## Acceptance Criteria

- [x] `trending-tmdb` shelf wraps existing trending endpoint logic
- [x] `trending-plex` shelf wraps existing Plex trending logic (hidden when disconnected)
- [x] `recommendations` shelf wraps existing scored recommendations (cold-start at 5 comparisons)
- [x] `from-your-watchlist` shelf wraps existing watchlist recs
- [x] `worth-rewatching` shelf wraps existing rewatch suggestions
- [x] `from-your-server` shelf wraps existing unwatched library ranking
- [x] `best-in-genre` shelf replaces genre spotlight (already specced in US-06)
- [x] Context shelves replace context-aware picks (already specced in US-06 as `context` template)
- [x] Existing service functions reused — no rewrite of query logic, just wrap in ShelfDefinition interface
- [x] Tests: each migrated shelf produces same results as the old endpoint
