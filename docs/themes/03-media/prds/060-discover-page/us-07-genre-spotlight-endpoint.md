# US-07: Genre Spotlight backend endpoint

> PRD: [060 — Discover Page](README.md)
> Status: Done

## Description

As a developer, I want an endpoint that selects the user's top genres with variety and fetches high-rated movies per genre from TMDB.

## Acceptance Criteria

- [x] `media.discovery.genreSpotlight` tRPC query
- [x] Selects 2-3 genres from the user's genre affinity data (ELO-based)
- [x] Selection avoids closely related genres (e.g., not "Action" and "Adventure" together)
- [x] Falls back to watch history genre distribution if no comparison data
- [x] For each genre, fetch TMDB `/discover/movie?with_genres={id}&sort_by=vote_average.desc&vote_count.gte=100`
- [x] Exclude: library movies, dismissed movies
- [x] Score results using `scoreDiscoverResults`
- [x] Return `{ genres: Array<{ genreId: number, genreName: string, results: ScoredDiscoverResult[] }> }`
- [x] Returns empty when no genre data available (empty library + no comparisons)
- [x] Tests cover: genre variety selection, fallback, exclusions, empty state
