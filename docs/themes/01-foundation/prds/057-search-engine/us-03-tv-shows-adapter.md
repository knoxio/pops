# US-03: TV shows search adapter (backend)

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As the system, I search TV shows by name and return typed `SearchHit` results with poster URLs, year, status, season count, and watch progress.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "tv-shows"`, icon: `"Tv"`, color: `"purple"`
- [ ] Searches TV shows by `name` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField: "name"` and `matchType` set correctly per hit
- [ ] Hit data shape: `{ name, year, posterUrl, status, numberOfSeasons, voteAverage }`
- [ ] Poster URL points to local cache (`/media/images/tv/{tvdbId}/poster.jpg`)
- [ ] Respects `options.limit` parameter
- [ ] Tests: search returns correct hits, scoring correct, poster URLs resolved

## Notes

Searches the local library only — not TheTVDB. Only `name` is searched, not `original_name`.
