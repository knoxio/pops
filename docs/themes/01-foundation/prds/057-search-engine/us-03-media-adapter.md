# US-03: Media search adapter

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want media data searchable so that I can find movies and TV shows from the global search.

## Acceptance Criteria

- [ ] Searches movies by `title` column (case-insensitive LIKE)
- [ ] Searches TV shows by `name` column (case-insensitive LIKE)
- [ ] Results include: URI, title, type badge, relevant metadata (year, rating)
- [ ] Poster thumbnail URL in results if poster_path is set
- [ ] Relevance scoring: exact match (score 1.0) > starts-with (0.8) > contains (0.5)

## Notes

Media search queries the local library only — not external APIs (TMDB/TheTVDB). External search is the media app's Search page.

Columns searched per type:
- **Movie**: `title` only (not `original_title` — user searches in their display language)
- **TV show**: `name` only
