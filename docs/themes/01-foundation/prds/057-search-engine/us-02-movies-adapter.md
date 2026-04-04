# US-02: Movies search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I search movies by title and return typed `SearchHit` results with poster URLs, year, rating, and runtime.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "movies"`, icon: `"Film"`, color: `"purple"`
- [ ] Searches movies by `title` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField: "title"` and `matchType` set correctly per hit
- [ ] Hit data shape: `{ title, year, posterUrl, voteAverage, runtime }`
- [ ] Poster URL points to local cache (`/media/images/movie/{tmdbId}/poster.jpg`)
- [ ] Respects `options.limit` parameter
- [ ] Tests: search returns correct hits, scoring is correct, poster URLs resolved

## Notes

Searches the local library only — not TMDB. Only `title` is searched, not `original_title`.
