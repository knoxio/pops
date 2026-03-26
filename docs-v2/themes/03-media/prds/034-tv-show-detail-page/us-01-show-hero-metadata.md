# US-01: Show hero and metadata layout

> PRD: [034 — TV Show Detail Page](README.md)
> Status: To Review

## Description

As a user, I want to see a TV show's full details — backdrop, poster, title, year range, status, genres, networks, and overview — so that I have all the information about a show in my library in one place.

## Acceptance Criteria

- [ ] Page renders at `/media/tv/:id` and fetches show data via `media.library.getTvShow`
- [ ] Hero section displays a full-width backdrop image with a gradient overlay for text readability
- [ ] If no backdrop image exists, the hero uses a solid colour gradient as fallback
- [ ] Poster renders overlaid on the hero, using the 3-tier fallback chain (override → cached → placeholder)
- [ ] Title renders as a large heading within the hero
- [ ] Year range displays correctly: "Start – End" for ended shows, "Start – Present" for continuing shows, "Start" for single-season ended shows
- [ ] Status renders as a badge or label (Continuing, Ended, Upcoming)
- [ ] Genres render as comma-separated text or badge pills
- [ ] Networks render below or alongside genres (e.g., "HBO", "Netflix")
- [ ] Overview section displays the full synopsis text below the hero
- [ ] Page shows a loading state (skeleton) while data is fetching
- [ ] Page shows a 404 state or redirects to library when the show ID does not exist
- [ ] Tests cover: hero renders with backdrop, fallback gradient, poster fallback chain, year range formatting for all three cases (ended, continuing, single-season), status badge, 404 handling

## Notes

Reuse the same hero layout pattern from the movie detail page (PRD-033 US-01) where possible — same gradient overlay, same poster positioning, same skeleton structure. The key differences are year range (vs. single year), status badge, and networks. A shared `HeroSection` component or layout could reduce duplication.
