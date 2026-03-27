# US-01: Show hero and metadata layout

> PRD: [034 — TV Show Detail Page](README.md)
> Status: Done

## Description

As a user, I want to see a TV show's full details — backdrop, poster, title, year range, status, genres, networks, and overview — so that I have all the information about a show in my library in one place.

## Acceptance Criteria

- [x] Page renders at `/media/tv/:id` and fetches show data via `media.library.getTvShow`
- [x] Hero section displays a full-width backdrop image with a gradient overlay for text readability
- [x] If no backdrop image exists, the hero uses a solid colour gradient as fallback
- [x] Poster renders overlaid on the hero, using the 3-tier fallback chain (override → cached → placeholder)
- [x] Title renders as a large heading within the hero
- [x] Year range displays correctly: "Start – End" for ended shows, "Start – Present" for continuing shows, "Start" for single-season ended shows
- [x] Status renders as a badge or label (Continuing, Ended, Upcoming)
- [x] Genres render as comma-separated text or badge pills
- [x] Networks render below or alongside genres (e.g., "HBO", "Netflix")
- [x] Overview section displays the full synopsis text below the hero
- [x] Page shows a loading state (skeleton) while data is fetching
- [x] Page shows a 404 state or redirects to library when the show ID does not exist
- [x] Tests cover: hero renders with backdrop, fallback gradient, poster fallback chain, year range formatting for all three cases (ended, continuing, single-season), status badge, 404 handling

## Notes

Reuse the same hero layout pattern from the movie detail page (PRD-033 US-01) where possible — same gradient overlay, same poster positioning, same skeleton structure. The key differences are year range (vs. single year), status badge, and networks. A shared `HeroSection` component or layout could reduce duplication.
