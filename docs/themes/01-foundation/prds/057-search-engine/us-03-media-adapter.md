# US-03: Media search adapter

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a user, I want media data searchable so that I can find movies and TV shows from the global search, each rendered with poster thumbnails.

## Acceptance Criteria

- [ ] Adapter registered with `domain: "media"`, icon: `"Film"`, color: `"purple"`
- [ ] Searches movies by `title` column (case-insensitive LIKE)
- [ ] Searches TV shows by `name` column (case-insensitive LIKE)
- [ ] Relevance scoring: exact match (1.0) > prefix (0.8) > contains (0.5)
- [ ] `matchField` and `matchType` set correctly per hit
- [ ] Hit data shapes:
  - Movie: `{ title, year, posterUrl, voteAverage }`
  - TV show: `{ name, year, posterUrl, voteAverage, status }`
- [ ] `ResultComponent` renders poster thumbnail (small, left-aligned) + title + year + rating
- [ ] `ResultComponent` highlights the matched portion of the title using `query` prop + `matchField`/`matchType`
- [ ] Poster URL points to local cache (`/media/images/movie/{tmdbId}/poster.jpg`)
- [ ] Tests: search returns correct hits, poster URLs resolved, scoring correct

## Notes

Media search queries the local library only — not external APIs (TMDB/TheTVDB). External search is the media app's Search page. Only `title` (movies) and `name` (TV shows) are searched — not `original_title` or `original_name`.
