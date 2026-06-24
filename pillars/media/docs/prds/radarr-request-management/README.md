# Radarr Request Management

Status: Done — request movies via Radarr from anywhere a movie surfaces (detail page, search results, discovery). Pick a quality profile and root folder, confirm, and Radarr adds the movie monitored with an automatic search. Configuration is env-only; an in-app credential settings UI is deferred (see ../../ideas/arr-credential-settings-page.md), as are bulk requesting and queue/profile management (see ../../ideas/radarr-request-extensions.md).

## Purpose

Replace Overseerr as the single request interface inside POPS. A user encountering a movie not yet in Radarr can request it in two clicks: open the modal, confirm. The movie is added with `monitored: true` and `addOptions.searchForMovie: true`, so no manual search is needed afterward.

## Configuration (env-only)

Radarr is configured via `RADARR_URL` + `RADARR_API_KEY`. There is no in-app write path — the server cannot rewrite its own env at runtime and the pillar owns no credential store. `GET /arr/config` and `GET /arr/settings` project read-only presence flags (URLs and booleans; key values never leave the server).

- [x] `getRadarrClient()` returns a client only when both URL and key are set, else `null`; every Radarr route guard (`requireRadarr`) raises `409 Conflict` ("Radarr is not configured") when unconfigured.

## REST API surface (`arr.*` sub-router)

All routes live under the media ts-rest contract; responses are `{ data: ... }` envelopes. Cross-pillar consumers reach them via the `@pops/pillar-sdk` `pillar('media')` client.

| Method | Path                                      | Purpose                                                                       |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------- |
| GET    | `/arr/config`                             | `{ radarrConfigured, sonarrConfigured }` presence flags                       |
| GET    | `/arr/settings`                           | Read-only URLs + configured booleans (no key values)                          |
| GET    | `/arr/radarr/quality-profiles`            | `Profile[]` (`{ id, name }`) — proxies `GET /api/v3/qualityprofile`           |
| GET    | `/arr/radarr/root-folders`                | `RootFolder[]` (`{ id, path, freeSpace }`) — proxies `GET /api/v3/rootfolder` |
| POST   | `/arr/radarr/movies`                      | Add movie; 201 `{ data: RadarrMovie }`                                        |
| GET    | `/arr/radarr/movies/:tmdbId/check`        | `{ exists, radarrId?, monitored? }` — proxies `GET /api/v3/movie?tmdbId=X`    |
| GET    | `/arr/radarr/movies/:tmdbId/status`       | `{ status, label, progress? }` — derived, 5-min cached (badge + request gate) |
| PATCH  | `/arr/radarr/movies/:radarrId/monitoring` | Toggle monitoring; returns updated movie                                      |
| POST   | `/arr/radarr/movies/:radarrId/search`     | Trigger `MoviesSearch` command                                                |

- [x] `addMovie` body is `{ tmdbId, title, year, qualityProfileId, rootFolderPath }`; the handler sends `monitored: true` and `addOptions: { searchForMovie: true }` to Radarr — Radarr fetches the rest of the metadata from TMDB itself.
- [x] `checkMovie` returns `{ exists: false }` when Radarr returns an empty array for the TMDB id; else `{ exists: true, radarrId, monitored }`.
- [x] `updateMonitoring` fetches the full movie first, merges the flag, then PUTs the whole object (Radarr requires the full body).
- [x] `triggerSearch` POSTs `{ name: "MoviesSearch", movieIds: [radarrId] }`.
- [x] Body validation (zod): `tmdbId`/`year`/`qualityProfileId` positive ints, `rootFolderPath` non-empty.
- [x] The shared base client uses `X-Api-Key`, a 10s timeout, and maps network/timeout/non-2xx failures to a descriptive `ArrApiError` (with status) — handlers never throw unhandled.
- [x] Adding a movie clears the cached movie status for that `tmdbId` so the next status read reflects the new state.

## Request modal (`RequestMovieModal`)

Takes `{ tmdbId, title, year }`. Header shows `title (year)`.

- [x] On open, quality profiles and root folders are fetched in parallel and fresh each time (not cached); both dropdowns default to the first option.
- [x] Root folder options show path + free space.
- [x] Confirm ("Request") is disabled until both a profile and a folder are selected, and while the fetch or the submit is in flight (spinner shown).
- [x] On success: brief "Movie Added" state, then the modal closes after ~1.5s and the `media/arr` queries are invalidated.
- [x] On error: inline message (e.g. Radarr's "movie already exists"); confirm re-enables.
- [x] Cancel / backdrop / Escape close the modal without an API call; closing is blocked while a submit is pending.
- [x] If profiles or folders fail to load, the modal shows an error state with a retry that refetches both.
- [x] A `'download'` mode variant skips the selectors and calls `downloadAndProtect` (rotation defaults from env); the request flow is the default `'request'` mode.

## Request button (`RequestMovieButton`)

Renders a "Request" affordance and gates its own visibility. Standard variant on the detail page; compact (icon) variant on cards.

- [x] Disabled with a "Radarr not configured" tooltip when `GET /arr/config` reports `radarrConfigured: false`.
- [x] Existence is determined via `GET /arr/radarr/movies/:tmdbId/status`: the button does not render when the status is anything other than `not_found` (the status badge already conveys it is tracked). The status query is gated behind `radarrConfigured` and runs only when Radarr is configured.
- [x] Returns nothing while the status query is loading or errors (Radarr unreachable) — same graceful-degradation pattern as the status badge, never an error UI.
- [x] After a successful request the status query is invalidated, so the button disappears and the badge updates without a reload.
- [x] Integrated at all three surfaces via `MovieActionButtons`: movie detail header (`MovieHeroActions`), search result cards (`SearchResultCard`), and discovery cards (`DiscoverCardOverlay`). When the rotation engine is running, `MovieActionButtons` swaps to the queue/download buttons instead.

## Business rules

- Requesting adds to Radarr AND auto-searches — no separate manual search step.
- Profiles and root folders are fetched fresh per modal open (correctness over caching; they change rarely).
- The button is absent (not disabled) when the movie is already tracked, and disabled with a tooltip only when Radarr is unconfigured.
- Requesting from search results adds to Radarr only; it does not add the movie to the POPS library (that is the rotation `downloadAndProtect` path).

## Edge cases

- [x] Movie already in Radarr → status ≠ `not_found` → button not rendered.
- [x] Radarr unconfigured → button disabled with tooltip; status query never fires.
- [x] Radarr unreachable when the modal opens → modal error state with retry; confirm disabled.
- [x] Empty profiles/folders → confirm cannot enable (no default selected).
- [x] Add fails → inline error from Radarr; modal stays open.
- [x] Add succeeds but the auto-search fails → handled by Radarr's own retry; the request still reports success.

## Out of scope (built elsewhere / not built)

- Sonarr request management — separate PRD (`../sonarr-request-management`).
- Bulk requesting, download-queue management (pause/cancel/prioritise — the queue is display-only), and in-app quality-profile/tag management — see `../../ideas/radarr-request-extensions.md`.
- In-app credential settings UI — see `../../ideas/arr-credential-settings-page.md`.
  </content>
  </invoke>
