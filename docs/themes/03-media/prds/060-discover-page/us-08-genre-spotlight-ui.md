# US-08: Genre Spotlight frontend rows

> PRD: [060 — Discover Page](README.md)
> Status: Not started

## Description

As a user, I want to see genre-specific rows of top movies so I can explore genres I'm drawn to.

## Acceptance Criteria

- [ ] Renders 2-3 `HorizontalScrollRow` components, one per genre
- [ ] Each row titled: "Best in {Genre}" (e.g., "Best in Action")
- [ ] Each row supports Load More (fetches next page from TMDB discover)
- [ ] Hidden when the endpoint returns empty genres
- [ ] Loading skeleton while genre data loads
- [ ] Tests cover: multiple genre rows render, titles correct, load more works
