# Ratings & Comparisons

> Status: Done — pairwise-ELO ranking engine, smart-pair arena, rankings, tier
> lists, dimension management, and quick-pick are all shipped. Movies-only;
> TV-show comparisons and AI-driven pairings are deferred (see
> [idea](../../ideas/comparisons-tv-and-ai.md)).

Rank a watched movie library by personal taste. Two watched movies are shown
side by side on a taste dimension; the user picks a winner (or a tiered draw)
and both movies' ELO scores move. A rankings leaderboard, a tier-list batch
flow, a comparison-history audit trail, and a quick-pick "what to watch" helper
sit on top of the same engine. Per-dimension weights blend into an overall rank.

## Data model (media pillar SQLite)

- `comparison_dimensions` — `id`, `name` (unique), `description`, `active`
  (0/1), `sort_order`, `weight` (REAL, default 1.0), `created_at`. Five defaults
  (Cinematography, Entertainment, Emotional Impact, Rewatchability, Soundtrack)
  are seeded on first read when the table is empty.
- `comparisons` — `id`, `dimension_id`, `media_a_type`/`media_a_id`,
  `media_b_type`/`media_b_id`, `winner_type`/`winner_id` (winner_id `0` = draw),
  `draw_tier` (`high`|`mid`|`low`|null), `source` (`arena`|`tier_list`|null),
  `delta_a`/`delta_b` (recorded ELO movement), `compared_at`.
- `media_scores` — unique `(media_type, media_id, dimension_id)`; `score` (REAL,
  default 1500.0, never rounded in storage), `comparison_count`, `excluded`
  (0/1), `updated_at`. `confidence` is computed, not stored.
- `comparison_skip_cooloffs` — a skipped pair is suppressed until the global
  comparison count advances by 10; pair key is order-normalized (A-vs-B == B-vs-A).
- `comparison_staleness` — per media item, `staleness` (REAL, default 1.0 = fresh);
  `markStale` multiplies by 0.5 (floor 0.01); a row's absence means fresh.
- `tier_overrides` — unique `(media_type, media_id, dimension_id)` → `tier`
  (`S`|`A`|`B`|`C`|`D`), so a tier-list round can rehydrate prior placements.

Tuning knobs (`eloK`=32, `defaultScore`=1500, `maxTierListMovies`=8,
`stalenessThreshold`=0.3, `defaultLimit`=50) resolve per-call from the pillar's
federated `/settings`, so edits take effect without a restart.

Poster URLs are served by the `/media/images/...` byte route (Express
static/proxy serving `MEDIA_IMAGES_DIR`) — it is NOT part of the ts-rest
contract. Rankings/pairs/tier-list rows return `posterUrl` as
`/media/images/movie/:tmdbId/poster.jpg` (or a stored override path).

## REST API surface (ts-rest contract)

Dimensions

- `GET /comparison-dimensions` — list by sort order (seeds defaults if empty).
- `POST /comparison-dimensions` — create (name required + unique; weight 0.1–10).
- `PATCH /comparison-dimensions/:id` — edit name/description/active/sortOrder/weight.

Comparisons

- `POST /comparisons` — record a 1v1 (or draw) and update ELO on both media.
- `GET /comparisons` — list all (optional `dimensionId`, movie-title `search`, paginated).
- `GET /comparisons/for-media` — list comparisons involving one media item.
- `GET /comparisons/smart-pair` — pick a pair (optional `dimensionId`); random fallback.
- `POST /comparisons/skip` — put a pair on a 10-comparison cooloff.
- `POST /comparisons/batch` — record many comparisons for one dimension in a transaction.
- `POST /comparisons/blacklist-movie` — mark watch events, purge its comparisons, recalc ELO.
- `POST /comparisons/recalc-all` — replay every comparison across all active dimensions.
- `DELETE /comparisons/:id` — delete and replay-recalc the affected dimension.

Scores / rankings

- `GET /comparison-scores` — ELO scores for a media item (optionally one dimension).
- `GET /comparison-rankings` — ranked media, per-dimension or weight-blended overall.
- `POST /comparison-scores/exclude` / `…/include` — exclude/re-include a media item on a dimension.
- `GET /comparison-staleness` + `POST /comparison-staleness/mark` — read / decay staleness.

Tier list

- `GET /tier-list/:dimensionId` — up to N movies for a placement round (greedy NEW-pair coverage).
- `POST /tier-list` — submit placements → derived pairwise comparisons + tier overrides.

Quick pick

- `GET /library/quick-pick` and `GET /discovery/quick-pick` — random unwatched movies (`count`, default 3).

## Routes (frontend, mounted under `/media`)

`/compare` (arena), `/compare/history` (comparison history), `/rankings`,
`/quick-pick`, `/tier-list`. Quick pick is also reachable from a "Tonight?"
header button (`QuickPickDialog`).

## ELO algorithm

- Expected: `1 / (1 + 10^((opponentScore - score) / 400))`.
- Update: `newScore = oldScore + K * (actual - expected)`, K=32, start 1500.0.
- Winner actual = 1, loser = 0. Draw (`winnerId=0`) actual = draw-tier outcome:
  high → 0.7 (both gain), mid/null → 0.5 (neutral), low → 0.3 (both lose).
- Recorded `delta_a`/`delta_b` are the rounded score movement; stored `score`
  keeps full REAL precision.
- Recording is transactional: both score rows + the comparison commit together,
  or none do. A delete or blacklist replays the dimension from baseline in
  `compared_at` order. `source` precedence (`tier_list` > `arena`) decides
  whether a re-recorded pair overrides (replay) or is a no-op.

## Business rules

- Only watched movies are eligible for the arena; watchlisted and
  dimension-excluded movies are filtered out of the candidate pool (with a
  fallback that drops the watchlist filter if it would leave < 2 eligible).
- Arena pairs are picked by `getSmartPair`: a dimension is chosen by need, then
  candidate pairs are scored (information gain × recency × staleness × confidence
  need × jitter) and sampled weighted-randomly; falls back to a random pair, then
  to `reason: 'insufficient_watched_movies'` when < 2 eligible.
- Overall ranking = weight-blended average `Σ(score·weight)/Σ(weight)` across
  active dimensions; a dimension's missing scores don't penalize. Weight 0 is
  rejected by the contract (min 0.1) — exclusion is the lever for removal.
- Deactivating a dimension removes it from arena rotation and the overall blend
  but preserves its comparisons and scores. Dimensions are never deleted, only
  deactivated.
- Rankings sort: scored movies by score desc, ties alphabetical; zero-comparison
  movies sort last alphabetically at 1500.0.
- Quick pick = library movies with no `completed=1` watch-history entry, random
  per request; returns fewer than `count` without erroring when the pool is small.

## Acceptance criteria

Arena (`/compare`)

- [x] Renders two poster cards (title, year, poster) with the dimension prompt "Which has better {Dimension}?".
- [x] Pair comes from `GET /comparisons/smart-pair`; weighting + cooloff are server-side, so the client tracks no history.
- [x] Picking a card records via `POST /comparisons` and loads the next pair; cards disable until the next pair to block double-submit.
- [x] Three tiered-draw buttons (High/Mid/Low) between the cards record a draw (winnerId 0 + drawTier) → ELO 0.7/0.5/0.3.
- [x] Skip calls `POST /comparisons/skip` (10-comparison cooloff) and fetches a new pair without recording.
- [x] Add-to-watchlist per card; watchlisted movies are excluded from future pairs.
- [x] Score-delta animation reflects the recorded `delta_a`/`delta_b`.
- [x] < 2 eligible movies → `reason: 'insufficient_watched_movies'` renders an empty state with a CTA.

ELO + integrity

- [x] `POST /comparisons` rejects a winner that is neither media A nor B (unless winnerId 0 = draw) and an inactive dimension.
- [x] Both score rows are created at 1500.0 if absent, updated, and `comparison_count` incremented, all in one transaction (no partial writes on failure).
- [x] Scores stored as REAL with no rounding; only deltas are rounded.

Rankings (`/rankings`)

- [x] `GET /comparison-rankings` drives a leaderboard with rank, poster, title, score (1 dp), comparison count; paginated.
- [x] Dimension selector ("Overall" default + each active dimension) persisted in `?dimension=`.
- [x] Overall is weight-blended across active dimensions; zero-comparison movies appear at 1500.0 sorted last.

Dimension management

- [x] List by sort order with name/description/active; create (unique name, weight 0.1–10), edit, toggle active, set weight.
- [x] Duplicate name → conflict error; default five dimensions seeded on first use; deactivate (never delete) preserves history.
- [x] Weight changes re-blend the overall ranking; deactivated dimensions drop out of arena + overall.

Comparison history (`/compare/history`)

- [x] `GET /comparisons` lists both items, winner, dimension, date, newest first; optional dimension filter and title search; paginated.
- [x] Per-row delete (`DELETE /comparisons/:id`) replay-recalculates the dimension; a 5s undo toast can reverse before commit.

Tier list (`/tier-list`)

- [x] `GET /tier-list/:dimensionId` returns up to `maxTierListMovies` chosen by greedy NEW-pair coverage, excluding blacklisted/excluded/too-stale movies, with prior tier overrides hydrated.
- [x] `POST /tier-list` converts placements into pairwise comparisons + tier overrides in one transaction and recalcs ELO.

Quick pick (`/quick-pick`)

- [x] Random unwatched movies (count 2–5, default 3, persisted in `?count=`) as poster cards with a "Watch This" link to the detail page; "Show me others" refetches.
- [x] Partial fill when fewer unwatched than requested; empty state with a CTA when none.
- [x] `QuickPickDialog` always renders a visible panel: loading skeleton, pick card, empty state, or error — never a silent no-op.

## Edge cases

- All candidate pairs on cooloff → smart-pair falls back to an unscored eligible pair, then random.
- New / reactivated dimension → every movie starts at 1500.0 for it.
- Movie blacklisted → its comparisons are purged and each affected dimension replayed; the movie is excluded from future pairs.
- Same pair across multiple dimensions is allowed — each dimension is independent.

## Deferred (not built)

- TV-show comparisons (schema supports `tv_show`, runtime is movies-only) and
  AI-driven comparison pairings/prompts → [idea](../../ideas/comparisons-tv-and-ai.md).
