# Arr Status Display

> Status: Partial — status badges, base client, connection tests, and read-only config projection are shipped. There is no in-app settings page that writes Radarr/Sonarr credentials: config is ENV-ONLY and the `/media/arr` route redirects to the shell settings hub (`/settings#media.arr`). The credential-editing UI is deferred — see [ideas/arr-credential-settings-page.md](../../ideas/arr-credential-settings-page.md).

Read integration with Radarr (movies) and Sonarr (TV). Colour-coded status badges on movie/TV detail pages reflect each title's monitoring/download state in the external service. A shared base client backs both services; connection-test and read-only config endpoints let the shell render service health without ever exposing API keys.

## Purpose

Surface "is this in my download manager, and what state is it in?" at a glance on the detail pages, with zero configuration burden inside the SPA. Credentials live in deployment env; the pillar derives presence flags from env and never persists or returns keys.

## Configuration (ENV-only)

The `media` pillar reads its arr config from environment variables — there is no settings table for these keys and no runtime write path (a server cannot rewrite its own env):

| Var                                                    | Purpose                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `RADARR_URL`, `RADARR_API_KEY`                         | Radarr base URL + key. Both present ⇒ `radarrConfigured`.                       |
| `SONARR_URL`, `SONARR_API_KEY`                         | Sonarr base URL + key. Both present ⇒ `sonarrConfigured`.                       |
| `RADARR_QUALITY_PROFILE_ID`, `RADARR_ROOT_FOLDER_PATH` | Rotation defaults consumed by download-and-protect (out of scope for this PRD). |

- [x] `getArrConfig()` derives `radarrConfigured` / `sonarrConfigured` purely from env presence.
- [x] `getArrSettings()` exposes URLs + presence flags; API key values are never read back out of the projection.

## Status Badge

`ArrStatusBadge` renders one badge on the movie hero (`kind="movie"`, TMDB id) and on the TV-show hero (`kind="show"`, TVDB id). It first reads `/arr/config`; if the relevant service is unconfigured it renders nothing.

Radarr movie status (precedence top-down):

| Status        | Label            | Colour | Condition                                                  |
| ------------- | ---------------- | ------ | ---------------------------------------------------------- |
| `downloading` | `Downloading N%` | yellow | title is in the Radarr queue; `N` = `(size-sizeleft)/size` |
| `available`   | `Available`      | green  | `hasFile`                                                  |
| `monitored`   | `Monitored`      | yellow | monitored, no file                                         |
| `unmonitored` | `Unmonitored`    | grey   | in Radarr, monitoring off                                  |
| `not_found`   | `Not in Radarr`  | grey   | absent from Radarr                                         |

Sonarr series status (precedence top-down): `not_found` (absent from Sonarr) > `downloading` (with `S0xE0y` episode label) > `unmonitored` (grey, monitoring off — short-circuits before the file checks) > `complete` (green, all episodes have files) > `partial` (yellow, `N/M episodes`) > `monitored` (yellow). The `unmonitored` check precedes the file-count checks in the mapper, so a fully-filed-but-unmonitored series reads `Unmonitored`, not `Complete`.

- [x] Exactly one badge renders per item; precedence is enforced server-side in the status mapper.
- [x] Downloading badge includes progress (`Downloading 45%` for movies; episode label for series).
- [x] Badge is hidden entirely when the service is unconfigured (`/arr/config` flag false) and while the status query is loading.
- [x] On service unreachable, the badge query errors and a grey `Radarr unavailable` / `Sonarr unavailable` badge renders (not an empty area).
- [x] Sonarr partial availability shows `partial`/`monitored`, not `available` — per-episode "available" is reserved for fully-filed series (`complete`).
- [x] Status string → Tailwind class is centralised in `ARR_STATUS_STYLES`; an unknown status falls back to the `not_found` (grey) style.

## Base Client

`ArrBaseClient` is the shared HTTP layer; `RadarrClient` and `SonarrClient` extend it. `getRadarrClient()` / `getSonarrClient()` return a configured instance or `null` when env is incomplete.

- [x] Authenticates every request with the `X-Api-Key` header against `<baseUrl>/api/v3`.
- [x] Typed `get<T>` / `post<T>` / `put<T>` / `delete` helpers; trailing slashes on the base URL are stripped.
- [x] Per-instance in-memory GET cache, keyed by full URL (base + path), 30s TTL — Radarr and Sonarr caches cannot collide.
- [x] `clearCache()` flushes a client instance; mutations (add/monitor/search) clear it plus the status caches so the next read is fresh.
- [x] All fetches use `AbortSignal.timeout(10_000)`; timeouts and network errors are wrapped in a descriptive `ArrApiError` rather than thrown raw.
- [x] Graceful degradation: status lookups return stale cache on failure, else a `not_found`/`unavailable` result — they never throw to the caller.
- [x] Movie/show status lookups carry an additional module-level 5-minute cache (`status-cache.ts`), keyed by TMDB/TVDB id.

## REST API surface (`arr.*`, served under the media contract)

Status + config (the read path this PRD owns):

| Method + path                                                 | Returns                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /arr/config`                                             | `{ radarrConfigured, sonarrConfigured }` — drives badge conditional rendering                            |
| `GET /arr/settings`                                           | `{ radarrUrl, radarrConfigured, sonarrUrl, sonarrConfigured }` — URLs + presence flags, never key values |
| `GET /arr/radarr/movies/:tmdbId/status`                       | `{ status, label, progress? }`                                                                           |
| `GET /arr/sonarr/series/:tvdbId/status`                       | `{ status, label, episodeStats? }`                                                                       |
| `POST /arr/radarr/test` · `POST /arr/sonarr/test`             | test creds supplied in the body ⇒ `{ configured, connected, version?, appName?, error? }`                |
| `POST /arr/radarr/test-saved` · `POST /arr/sonarr/test-saved` | test the env-configured creds ⇒ same shape                                                               |
| `GET /arr/queue`                                              | combined Radarr + Sonarr download queue                                                                  |

Connection-test behaviour:

- [x] A test returns `{ configured: true, connected: true, version, appName }` on success.
- [x] If the upstream `appName` does not match the expected service (e.g. a Sonarr URL handed to the Radarr test), it returns `connected: false` with an `Expected Radarr but connected to Sonarr — check the URL` style error.
- [x] `test-saved` returns `{ configured: false, connected: false, error }` when env creds are missing, without attempting a network call.
- [x] Unconfigured mutating/data routes (add, monitoring, queue, profiles) raise `409 ConflictError` ("Radarr/Sonarr is not configured") before any upstream call.

The broader write surface (`addMovie`, `addSeries`, monitoring toggles, search triggers, calendar, profiles/root-folders, download-and-protect) is implemented but owned by the request/rotation PRDs, not this one.

## Business rules

- Status badges are read-only — they reflect external state, never mutate it.
- API keys are write-only from any client's perspective: no endpoint returns a key, and `/arr/settings` returns only URLs + booleans.
- Config is env-derived and immutable at runtime; there is no `saveSettings` route.
- The 30s client cache + 5-min status cache trade freshness for rate-limit safety against local services where latency is negligible.

## Edge cases

| Case                                    | Behaviour                                                                                                        |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Service not configured (env incomplete) | client factory returns `null`; badges hidden; status route returns `not_found` "not configured"; data routes 409 |
| Service unreachable                     | status returns stale cache if present, else `unavailable`; badge shows grey "X unavailable"                      |
| Wrong service behind the URL            | connection test returns `connected: false` with an appName-mismatch error                                        |
| Movie in Radarr but unmonitored         | grey `Unmonitored` badge                                                                                         |
| Movie downloading at 45%                | yellow `Downloading 45%` badge                                                                                   |
| Series with some episodes filed         | yellow `Partial (N/M episodes)` badge, not `Available`                                                           |
| Only one of Radarr/Sonarr reachable     | the working service renders badges; the other shows its unavailable badge                                        |
| Status cache TTL expires mid-view       | next badge check triggers a fresh upstream call; brief stale data may show                                       |

## Salvage note

The byte route `GET /media/images/...` serves `MEDIA_IMAGES_DIR` directly via Express and is NOT part of the ts-rest contract. Calendar poster URLs returned by the Sonarr surface point at upstream \*arr remote URLs, not that route; it is documented here only to flag that image bytes live outside the typed contract.

## Tests

- [x] `src/api/__tests__/arr.test.ts` exercises client → handler → contract over a mocked `globalThis.fetch`, with env set/cleared to cover the unconfigured branch (409s), status mapping, and connection tests.
- [x] `app/src/components/ArrStatusBadge.test.tsx` covers: hidden when unconfigured, hidden while loading, unavailable badge on error, each status colour, progress percentage, and the show (Sonarr) path.

## Out of scope

- In-app credential-editing settings page (URL/key inputs, masked-key display, save) — deferred, see ideas file.
- Requesting/adding movies (Radarr) and series (Sonarr), monitoring toggles, search triggers — owned by the request/rotation PRDs.
- Download queue management (start/stop/prioritise).
- Webhook receivers for real-time push status.
- Plex availability cross-checks (Plex Sync epic).
