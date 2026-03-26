# US-01: Movie hero and metadata layout

> PRD: [033 — Movie Detail Page](README.md)
> Status: Partial

## Description

As a user, I want to see a movie's full details — backdrop, poster, title, year, runtime, genres, tagline, overview, and metadata — so that I have all the information about a movie in my library in one place.

## Acceptance Criteria

- [x] Page renders at `/media/movies/:id` and fetches movie data via `media.library.getMovie`
- [x] Hero section displays a full-width backdrop image with a gradient overlay for text readability
- [x] If no backdrop image exists, the hero uses a solid colour gradient as fallback
- [x] Poster renders overlaid on the hero, using the same 3-tier fallback chain as MediaCard (override → cached → placeholder)
- [x] Title renders as a large heading within the hero
- [x] Release year renders next to or below the title
- [x] Runtime displays formatted as "Xh Ym" (e.g., "2h 15m"); hidden if runtime is null/zero
- [x] Genres render as comma-separated text or badge pills
- [x] Tagline renders in italic above the overview; hidden if empty or null
- [x] Overview section displays the full synopsis text
- [ ] Metadata grid displays: status, original language (full name, not ISO code), budget (formatted currency), revenue (formatted currency), TMDB rating (vote average + vote count) — language shows ISO code uppercased ("EN") not full name ("English")
- [x] Budget and revenue fields are hidden when their value is zero or null
- [ ] Watch history section lists all watch dates chronologically; shows "Not watched yet" if empty — section missing entirely
- [x] Page shows a loading state (skeleton) while data is fetching
- [x] Page shows a 404 state or redirects to library when the movie ID does not exist
- [ ] Tests cover: hero renders with backdrop, fallback gradient without backdrop, poster fallback chain, runtime formatting, hidden fields when null/zero, 404 handling, watch history list and empty state

## Notes

The hero section is the visual centrepiece — backdrop quality matters. Use a CSS gradient overlay (dark to transparent) so text is readable regardless of backdrop brightness. The metadata grid is a supporting section below the overview, not the focal point. Language codes like "en" should map to "English" for display.
