# US-05: Quick pick

> PRD: [037 — Ratings & Comparisons](README.md)
> Status: Partial

## Description

As a user, I want a "What should I watch?" page that shows random unwatched movies so that I can decide what to watch next without scrolling through my full library.

## Acceptance Criteria

- [x] Quick pick page renders at `/media/quick-pick`
- [ ] Displays a configurable number of random unwatched movies (default 3)
- [x] "Unwatched" = movies in the library that have no `completed=1` entry in watch_history
- [ ] Each movie displays as a poster card with title, year, and a "Watch This" action button
- [ ] "Watch This" navigates to the movie's detail page (`/media/movies/:id`)
- [ ] "Show me others" button fetches a new random set without page reload
- [ ] Count selector allows choosing how many movies to display (2, 3, 4, or 5)
- [ ] Count preference persists in `?count=` query param
- [x] Empty state: "Nothing unwatched in your library" with CTA to the search page
- [x] When fewer unwatched movies exist than the requested count, display all available (no error)
- [ ] Poster cards use the same MediaCard component or matching styling
- [ ] Tests cover: correct number of movies displayed, movies are unwatched, "Show me others" refreshes the set, count selector changes count, empty state renders, partial fill when few unwatched movies

## Notes

The random selection should be truly random on each request — not shuffled from a fixed seed. The quick pick is a lightweight decision aid, not a recommendation engine (that's PRD-038). The "Watch This" button navigates to the detail page where the user can mark it as watched, add to watchlist, etc.
