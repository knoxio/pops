# US-06: Genre and dimension shelves

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a user, I want discovery shelves based on my genre preferences and ELO dimensions so I see recommendations from multiple angles of my taste profile.

## Acceptance Criteria

- [ ] `best-in-genre` shelf: one instance per top genre from affinity profile
- [ ] `genre-crossover` shelf: instances for pairs of non-related top genres (e.g. Sci-Fi × Horror)
- [ ] `top-dimension` shelf: one instance per active ELO dimension, shows local movies ranked highest on that dimension
- [ ] `dimension-inspired` shelf: picks a high-scoring movie+dimension pair, queries TMDB recs filtered by dimension's genre correlation
- [ ] Genre crossover uses TMDB `/discover/movie?with_genres={id1},{id2}`
- [ ] Related genre pairs excluded from crossover (Action+Adventure, Mystery+Thriller, Drama+Romance, Fantasy+SciFi)
- [ ] All results scored by preference profile, dismissed filtered
- [ ] Tests: genre selection avoids related pairs, crossover produces results, dimension shelf sorts by ELO
