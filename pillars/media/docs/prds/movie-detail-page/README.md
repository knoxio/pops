# Movie Detail Page

Status: Done — missing only the dominant-colour backdrop fallback (see `../../ideas/movie-detail-poster-color-fallback.md`).

The primary single-movie view in the media app: hero with backdrop/poster/title, metadata, watchlist + mark-as-watched actions, comparison-score radar, and watch history. Renders at `/media/movies/:id` in the `media` app (host: `pillars/shell`).

## Data sources (REST)

All served by the `media` pillar's ts-rest contract; the app calls them through the generated `media-api` client. Poster/backdrop image bytes come from `GET /media/images/<type>/<externalId>/<file>.jpg` — an Express static/proxy route over `MEDIA_IMAGES_DIR`, **not** part of the ts-rest contract; movie rows carry pre-resolved `posterUrl`/`backdropUrl`/`logoUrl` pointing at it.

| Endpoint                                             | Use                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /movies/:id`                                    | Full movie metadata (`MovieSchema`: title, tagline, overview, runtime, status, originalLanguage, budget, revenue, voteAverage/voteCount, genres[], releaseDate, poster/backdrop/logo URLs, rotationStatus/rotationExpiresAt) |
| `GET /watch-history?mediaType=movie&mediaId=`        | Watch events for this movie                                                                                                                                                                                                  |
| `POST /watch-history`                                | Log a watch (`completed`, `source`, optional `watchedAt`); returns `{ data, watchlistRemoved, message }`                                                                                                                     |
| `DELETE /watch-history/:id`                          | Delete a watch event (undo)                                                                                                                                                                                                  |
| `GET /watchlist/status?mediaType=movie&mediaId=`     | `{ onWatchlist, entryId }`                                                                                                                                                                                                   |
| `POST /watchlist`                                    | Add (idempotent on mediaType+mediaId)                                                                                                                                                                                        |
| `DELETE /watchlist/:id`                              | Remove                                                                                                                                                                                                                       |
| `GET /comparison-scores?mediaType=movie&mediaId=`    | Per-dimension Elo (`score`, `comparisonCount`, `excluded`)                                                                                                                                                                   |
| `GET /comparison-dimensions`                         | Dimension names + sort order (axis labels)                                                                                                                                                                                   |
| `POST /comparison-scores/include`                    | Re-include the movie in a dimension it was excluded from                                                                                                                                                                     |
| `GET /comparison-staleness?mediaType=movie&mediaId=` | `{ staleness }` (1.0 = fresh) for the freshness badge                                                                                                                                                                        |

## Layout

**Hero** — full-width backdrop image (when `backdropUrl` present) under a fixed dark-to-transparent gradient overlay for text contrast; a breadcrumb (Media → title) overlays the top. Poster renders bottom-left via the 3-tier cascade (override → cached → muted placeholder). Title is a large heading, replaced by the TMDB logo image when `logoUrl` is set (title kept as `sr-only`). Tagline (italic) sits under the title; year and formatted runtime ("Xh Ym") follow. Action row and status badges sit beneath.

**Body** (max-w-4xl) — Overview, Genres, Comparison Scores, Excluded Dimensions, Details grid, Watch History, in that order.

**Action row** — WatchlistToggle, MarkAsWatchedButton, ArrStatusBadge, MovieActionButtons (request/open in \*arr), FreshnessBadge, and a LeavingBadge when `rotationStatus === 'leaving'`.

## Business rules

- Null/zero metadata fields are omitted entirely (no "N/A"). Budget/revenue hidden when falsy; runtime/language/rating hidden when null.
- `originalLanguage` ISO 639-1 code is rendered as a full language name (e.g. `en` → "English").
- WatchlistToggle is optimistic: it snapshots the status query, applies the next state immediately, rolls back and shows an error toast on failure, and invalidates `media/watchlist/status` on settle. The toggle is disabled while the initial status check is in flight.
- Mark-as-watched logs `completed=1, source='manual'` (optionally a custom `watchedAt`). On completion the server auto-removes the movie from the watchlist and reports it via `watchlistRemoved`.
- Undo lives in a 5s toast; it `DELETE`s the watch event and, only when `watchlistRemoved` was true, re-`POST`s the watchlist entry. After the window the watch persists.
- A movie can be watched repeatedly — the button stays enabled and shows the running count ("Watched (N)") plus the last-watched date.
- Comparison radar normalises Elo to 0–100 by clamping to **1000–2000** then mapping linearly. Axes follow dimension sort order and are labelled by dimension name; the fill uses `--primary` at 0.2 opacity and the chart is responsive.
- Comparison section visibility keys off total comparison count across dimensions: hidden entirely at 0, a "Not enough data — at least 3 comparisons needed" placeholder at 1–2, the radar at ≥3.
- Excluded Dimensions lists dimensions the movie is excluded from and offers a one-click re-include.

## Edge cases

- Non-numeric `:id` → "Invalid movie ID" alert. 404 from `GET /movies/:id` → "Movie not found" alert with a back-to-library link; other errors show the message.
- No `backdropUrl` → hero shows a plain muted background under the gradient (no per-poster colour derivation).
- No tagline / empty overview → those sections are not rendered.
- No watch events → "Not watched yet".

## Acceptance criteria

- [x] Page renders at `/media/movies/:id` and loads the movie via `GET /movies/:id`, with a skeleton while loading.
- [x] Hero shows backdrop (gradient overlay), poster (3-tier cascade), title-or-logo, tagline, year and "Xh Ym" runtime, plus a Media → title breadcrumb.
- [x] Details grid shows Status, Language (full name), Budget, Revenue, TMDB Rating, Runtime, omitting null/zero fields.
- [x] Genres render as badge pills linking to the library filtered by genre.
- [x] Watch History lists watch dates chronologically; "Not watched yet" when empty.
- [x] WatchlistToggle reads status, toggles optimistically, rolls back + toasts on failure, and is disabled during the status check.
- [x] MarkAsWatchedButton logs `completed=1`, shows a 5s undo toast, undo deletes the event and re-adds to the watchlist iff `watchlistRemoved`, supports a custom watch date, and stays usable for repeat watches with a count + last-watched line.
- [x] ComparisonScores hides at 0 comparisons, shows a "not enough data" placeholder at 1–2, and renders a normalised (1000–2000 → 0–100) radar with one labelled axis per dimension at ≥3.
- [x] ExcludedDimensions lets the user re-include the movie in a dimension.
- [x] Invalid-id and 404 states render their respective alerts.

## Out of scope

- Editing or deleting movie metadata; cast/crew; similar-movie recommendations; external links.
