# Idea: Post-watch debrief

A focused rapid-fire comparison session for a movie the user just watched: one
comparison per active dimension, each against a well-chosen opponent near the
median score for that dimension, run while the user's opinion is freshest. The
goal is to quickly calibrate the new movie's position across every dimension.

Nothing here is built today. The ratings/comparisons engine it would sit on top
of exists (the `comparisons` table, `comparison_dimensions`, `media_scores`,
`comparison_staleness`, and the REST surface under `/comparisons`), but there is
no debrief table, no debrief endpoints, no opponent-near-median selection, and no
debrief UI. The only trace is a forward-looking comment in
`src/db/services/watch-history.ts` noting that "queueing a debrief session" is
deferred to the orchestration layer. Movie-only; TV is out of scope.

## Data model to add

A `debrief_status` table, one row per (movie, active dimension):

- `id` PK
- `media_type` TEXT (`'movie'`)
- `media_id` INTEGER
- `dimension_id` INTEGER (FK → `comparison_dimensions`)
- `debriefed` INTEGER default 0 — a comparison was recorded for this dimension
- `dismissed` INTEGER default 0 — user skipped this dimension without comparing
- `created_at` TEXT — when queued (≈ watch event time)
- UNIQUE `(media_type, media_id, dimension_id)`

Rows are queued when a watch event is logged (insert one per active dimension);
on a re-watch of the same movie, existing rows reset `debriefed`/`dismissed` to 0.
A movie is "debriefed" once every row is `debriefed=1` or `dismissed=1`. A
dimension added after queuing is NOT backfilled retroactively; a dimension
deactivated after queuing keeps its row but is ignored by the UI.

## Opponent selection

`getDebriefOpponent(mediaType, mediaId, dimensionId)` returns the single scored
movie closest to the **median** score for that dimension (~60th percentile on the
0–100 normalized scale — "is this roughly better or worse than average?").
Excludes: the debrief movie itself, dimension-excluded movies, movies with all
watch events blacklisted, and any movie already compared against in this dimension
during the current debrief. If the median range is exhausted, expand outward; if
no eligible opponent remains, return null and skip (dismiss-with-reason) that
dimension.

## REST surface to add (under the media `/comparisons` contract)

- `GET /comparisons/debrief?mediaType&mediaId` → movie info, per-dimension status
  (pending / debriefed / dismissed), and the chosen opponent for each pending one.
- `POST /comparisons/debrief` `{ mediaType, mediaId, dimensionId, winnerId, drawTier? }`
  → records the comparison through the existing `POST /comparisons` ELO path
  (source `arena`, draw tiers `high`/`mid`/`low`) and sets `debriefed=1` on the row.
- `POST /comparisons/debrief/dismiss` `{ mediaType, mediaId, dimensionId }`
  → sets `dismissed=1`, no comparison recorded.
- `GET /comparisons/debrief/pending` → movies with incomplete debriefs, for the
  notification surfaces.

All authenticated. The debrief movie's comparison staleness is treated as 0
(just watched). Reuse the standard ELO update — no separate scoring path.

## UI to add

A debrief route `/media/debrief/:movieId`:

- header with poster, title, year, "Debrief: {title}";
- dimension progress indicator "{current} of {total}" with the dimension name;
- comparison layout (debrief movie left vs opponent right) with Pick A / Pick B /
  High / Mid / Low draw buttons, identical to the arena;
- after each pick, advance to the next pending dimension; "Skip this dimension"
  dismisses the current one; "Done for now" exits with completed dimensions saved;
- a completion summary: per-dimension result (won / lost / draw tier) and the new
  score.

Notification surfaces driven by the pending list:

- history-page tile "Debrief" button for movies with pending debriefs;
- library-page banner "N movies to debrief" linking to the first pending,
  session-dismissible (dismissing the banner does NOT dismiss individual rows);
- movie-detail "Debrief this movie" button when a debrief is pending.

All prompts hide once every dimension is debriefed or dismissed.

## Out of scope

TV-show debriefs; auto-starting the debrief on the watch event (trigger stays
manual but prompted); analytics beyond the badge/banner count.
