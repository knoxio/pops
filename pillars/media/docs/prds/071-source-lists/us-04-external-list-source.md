# US-04: External List Source

> PRD: [Source Lists](README.md)

## Description

As a user, I want to add external movie lists (IMDB Top 100, Letterboxd lists) as rotation sources so that curated lists feed into my candidate pool.

## Acceptance Criteria

- [x] `tmdb_top_rated` adapter fetches top-rated movies via TMDB discover endpoint (used instead of IMDB scraping per notes — more maintainable)
- [x] TMDB IDs come directly from the TMDB API response (no external ID resolution needed)
- [x] `letterboxd` adapter accepts a list URL in the source `config` and scrapes the list contents
- [x] Both adapters return `CandidateMovie[]` conforming to the plugin interface
- [x] Adapters handle pagination if the external list is large
- [x] Graceful degradation: if the external source is unreachable or the page structure changes, return empty array and log the error

## Notes

IMDB doesn't have a public API — scraping or using an intermediary (TMDB's curated lists, or a maintained IMDB dataset) may be more reliable. TMDB itself has a "Top Rated" endpoint (`/movie/top_rated`) that could serve as an alternative. Evaluate the most maintainable approach.
