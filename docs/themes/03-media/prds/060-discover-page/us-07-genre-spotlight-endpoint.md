# US-07: Genre Spotlight backend endpoint

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a developer, I want an endpoint that selects the user's top genres with variety and fetches high-rated movies per genre from TMDB.

## Acceptance Criteria

- [ ] `media.discovery.genreSpotlight` tRPC query
- [ ] Selects 2-3 genres from the user's genre affinity data (ELO-based)
- [ ] Selection avoids closely related genres (e.g., not "Action" and "Adventure" together)
- [ ] Falls back to watch history genre distribution if no comparison data
- [ ] For each genre, fetch TMDB `/discover/movie?with_genres={id}&sort_by=vote_average.desc&vote_count.gte=100`
- [ ] Exclude: library movies, dismissed movies
- [ ] Score results using `scoreDiscoverResults`
- [ ] Return `{ genres: Array<{ genreId: number, genreName: string, results: ScoredDiscoverResult[] }> }`
- [ ] Returns empty when no genre data available (empty library + no comparisons)
- [ ] Tests cover: genre variety selection, fallback, exclusions, empty state
