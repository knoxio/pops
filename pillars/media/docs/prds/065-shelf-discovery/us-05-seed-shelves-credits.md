# US-05: Director and actor shelves

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a user, I want to discover more movies from directors and actors I enjoyed so I can explore filmographies of people whose work I rate highly.

## Acceptance Criteria

- [x] `more-from-director` shelf: template, category seed
- [x] `more-from-actor` shelf: template, category seed
- [x] TMDB credits lookup: fetch `/movie/{id}/credits` to get director (crew, job=Director) and lead cast (first 3)
- [x] Credits cached per movie (in-memory or lightweight cache — avoids re-fetching)
- [x] Director shelf queries TMDB `/discover/movie?with_crew={personId}`
- [x] Actor shelf queries TMDB `/discover/movie?with_cast={personId}`
- [x] Seeds: directors/actors of movies with above-median ELO scores
- [x] Results exclude movies already in library, scored by profile
- [x] Tests: credits extraction, filmography query, caching, seed selection
