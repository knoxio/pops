# US-04: External List Source

> PRD: [Source Lists](README.md)

## Description

As a user, I want to add external movie lists (IMDB Top 100, Letterboxd lists) as rotation sources so that curated lists feed into my candidate pool.

## Acceptance Criteria

- [ ] `imdb_top_100` adapter fetches the IMDB Top 100 (or Top 250) list and extracts movie identifiers
- [ ] IMDB IDs are resolved to TMDB IDs via the TMDB "find by external ID" endpoint
- [ ] `letterboxd` adapter accepts a list URL in the source `config` and scrapes or fetches the list contents
- [ ] Both adapters return `CandidateMovie[]` conforming to the plugin interface
- [ ] Adapters handle pagination if the external list is large
- [ ] Graceful degradation: if the external source is unreachable or the page structure changes, return empty array and log the error

## Notes

IMDB doesn't have a public API — scraping or using an intermediary (TMDB's curated lists, or a maintained IMDB dataset) may be more reliable. TMDB itself has a "Top Rated" endpoint (`/movie/top_rated`) that could serve as an alternative. Evaluate the most maintainable approach.
