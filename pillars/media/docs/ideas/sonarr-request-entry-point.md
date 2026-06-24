# Idea: wire a "Request" entry point to RequestSeriesModal

`RequestSeriesModal` (plus its model, form, season-monitoring list, and queries under `app/src/components/request-series/`) is fully built and unit-tested, but nothing in the UI renders or opens it. There is no "Request" button on the TV show detail hero and no Sonarr request action on TV search-result cards. A user therefore cannot reach the add-series flow — they can only manage monitoring on series that are _already_ in Sonarr (added out-of-band), and browse the calendar.

The whole server side exists already (`POST /arr/sonarr/series`, the three profile/folder lists, `GET …/series/:tvdbId/check`), so this is purely front-end wiring.

## What to build

- On the TV show detail hero (`app/src/pages/tv-show-detail/TvShowHero.tsx`), when `check` reports `exists: false` and Sonarr is configured, render a "Request" button next to the `ArrStatusBadge` that opens `RequestSeriesModal` with the show's `tvdbId`, `title`, `year`, and a `seasons` array (`{ seasonNumber, firstAirDate }`) derived from the show's season metadata. Hide the button (or disable with a tooltip) when Sonarr is unconfigured, and don't render it when the series already exists.
- On TV search-result cards (`app/src/components/search-result-card/SearchResultActionButtons.tsx`), add a Sonarr "Request" action for `type === 'tv'` results not yet in Sonarr, mirroring the movie request affordance, opening the same modal.
- After a successful add, invalidate the relevant `['media','arr','checkSeries', { tvdbId }]` query so the badge flips to monitored and the season switches appear without a manual refresh.

## Why it is not built

The modal and its data layer landed, but the trigger was never attached to a page — the detail hero shows only the read-only status badge, and the search card's not-in-library actions cover movies and library/watchlist adds, with no Sonarr request path. Until the button is wired, the request flow is dead code reachable only by tests.
