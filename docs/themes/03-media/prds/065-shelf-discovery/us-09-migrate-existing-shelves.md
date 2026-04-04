# US-09: Migrate existing sections to shelf definitions

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a developer, I want the current 9 hardcoded discover sections re-registered as shelf definitions so the pool includes all existing functionality.

## Acceptance Criteria

- [ ] `trending-tmdb` shelf wraps existing trending endpoint logic
- [ ] `trending-plex` shelf wraps existing Plex trending logic (hidden when disconnected)
- [ ] `recommendations` shelf wraps existing scored recommendations (cold-start at 5 comparisons)
- [ ] `from-your-watchlist` shelf wraps existing watchlist recs
- [ ] `worth-rewatching` shelf wraps existing rewatch suggestions
- [ ] `from-your-server` shelf wraps existing unwatched library ranking
- [ ] `best-in-genre` shelf replaces genre spotlight (already specced in US-06)
- [ ] Context shelves replace context-aware picks (already specced in US-06 as `context` template)
- [ ] Existing service functions reused — no rewrite of query logic, just wrap in ShelfDefinition interface
- [ ] Tests: each migrated shelf produces same results as the old endpoint
