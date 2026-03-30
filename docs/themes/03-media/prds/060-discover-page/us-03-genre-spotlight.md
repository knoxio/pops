# US-03: Genre Spotlight

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see curated lists of top movies within my favourite genres so that I can explore specific genres I'm drawn to with variety rather than just my single top genre.

## Acceptance Criteria

- [ ] "Genre Spotlight" section renders as 2-3 sub-rows, each a `HorizontalScrollRow` for a different genre
- [ ] Genres selected from the user's top-rated genres by ELO comparison scores
- [ ] Selection includes variety — not just the #1 genre, but a spread (e.g., top genre, a mid-tier genre, and a genre with fewer comparisons but high scores)
- [ ] Each sub-row titled: "Best in {Genre}" (e.g., "Best in Action", "Best in Sci-Fi")
- [ ] For each genre, fetch TMDB `/discover/movie?with_genres={id}&sort_by=vote_average.desc&vote_count.gte=100`
- [ ] Results exclude movies already in the library and dismissed movies
- [ ] Movies scored against preference profile (same scoring as recommendations)
- [ ] Falls back to watch history genre distribution if no comparison data exists
- [ ] Hidden when the user has no genre data (empty library and no comparisons)
- [ ] Each genre row supports Load More for additional pages
- [ ] New `media.discovery.genreSpotlight` tRPC query: returns `{ genres: Array<{ genreId, genreName, results: DiscoverResult[] }> }`
- [ ] Tests cover: genre selection variety, fallback to watch history, results exclude library, scoring applied

## Notes

The genre selection algorithm should avoid showing two very similar genres (e.g., "Action" and "Adventure" together). Pick the top genre, skip the second if it's closely related, take the third, etc. TMDB genre IDs are well-known constants — use the existing `TMDB_GENRE_MAP` for ID-to-name mapping. The `vote_count.gte=100` filter prevents obscure low-vote movies from dominating.
