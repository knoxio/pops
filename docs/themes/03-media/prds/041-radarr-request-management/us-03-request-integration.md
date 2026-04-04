# US-03: Request button integration

> PRD: [041 — Radarr Request Management](README.md)
> Status: Partial

## Description

As a user, I want a "Request" button on movie detail pages, search results, and discovery recommendations so that I can add movies to Radarr from wherever I encounter them.

## Acceptance Criteria

- [x] `RequestMovieButton` component accepts a movie (tmdbId, title, year) and renders a "Request" button
- [x] Button is hidden (not rendered) when the movie already exists in Radarr — determined by calling `media.radarr.checkMovie(tmdbId)` which returns `exists: true`
- [x] Button is disabled with a "Radarr not configured" tooltip when Radarr is not configured — determined by `media.arr.getConfig()` returning `radarr.configured: false`
- [ ] Clicking the button opens the `RequestMovieModal`
- [ ] After a successful request, the button disappears and the arr status badge updates to reflect the new state (Monitored or Downloading)
- [x] Movie detail page: button renders in the header/action area alongside other actions
- [x] Search results page: button renders as an action on each movie result card
- [x] Discovery/recommendations page: button renders as an action on each recommended movie card
- [x] Button checks Radarr existence using the cached base client (30s TTL) — navigating between pages does not trigger redundant existence checks
- [x] Button renders a compact variant for card contexts (search results, discovery) and a standard variant for the detail page
- [x] If `checkMovie` fails (Radarr unreachable), the button does not render — same graceful degradation as status badges
- [ ] Tests verify: button hidden when movie exists in Radarr, button disabled when Radarr not configured, button absent when Radarr unreachable, clicking opens modal, button disappears after successful request, compact variant renders on cards, standard variant renders on detail page

## Notes

The button's visibility depends on three states: Radarr configured, Radarr reachable, and movie not already in Radarr. All three must be true for the button to appear. This mirrors the graceful degradation pattern from the status badges — if anything is wrong with the Radarr connection, the request feature is simply absent rather than showing errors. After a successful request, invalidate the `checkMovie` cache entry for this TMDB ID so the button disappears immediately.
