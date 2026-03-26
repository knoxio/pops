# US-01: MediaCard component

> PRD: [031 — Library Page](README.md)
> Status: Done

## Description

As a user, I want a poster card for each media item so that I can visually browse my library and navigate to detail pages.

## Acceptance Criteria

- [x] MediaCard renders a poster image, title, year, and optional type badge
- [x] Poster uses a 3-tier fallback chain: user override URL → cached API poster → placeholder SVG
- [x] If the override image fails to load, it falls through to the cached poster; if that fails, the placeholder renders
- [x] Title is truncated to 2 lines with CSS text overflow (ellipsis)
- [x] Year displays below the title in muted/secondary text
- [x] Type badge ("Movie" or "TV") renders as a small overlay or tag; visibility is controlled by a `showTypeBadge` prop
- [x] Clicking anywhere on the card navigates to `/media/movies/:id` for movies or `/media/tv/:id` for TV shows
- [x] Card has hover/focus state (subtle scale or shadow transition)
- [x] Card aspect ratio matches standard poster ratio (2:3)
- [x] Placeholder SVG is a generic media icon (no broken image indicator)
- [x] Tests cover: all three fallback tiers, badge visibility toggle, correct navigation URL per media type (title truncation untestable in JSDOM)

## Notes

The `showTypeBadge` prop lets the parent control badge visibility — the library page hides it when filtering by a specific type. Card dimensions should use the poster aspect ratio (2:3) so the grid stays uniform even with mixed fallback states.
