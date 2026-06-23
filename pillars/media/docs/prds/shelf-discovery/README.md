# Shelf-Based Discovery

Status: Done — except item-level jitter, the refresh fade transition, and true franchise detection, which are not built (see `../../ideas/shelf-discovery-polish.md`).

The discover page is assembled per session from a pool of shelf definitions. Each load runs a generate → score → weighted-random-select → fetch → filter pipeline, so the page composition (which shelves, in what order) changes between visits — a Netflix-like surface rather than a fixed list of sections.

## Data Model

`shelf_impressions` (own SQLite table) — tracks which shelves were surfaced, so recently-shown shelves score lower:

| Column     | Type    | Constraints                         |
| ---------- | ------- | ----------------------------------- |
| `id`       | INTEGER | PK, autoincrement                   |
| `shelf_id` | TEXT    | NOT NULL                            |
| `shown_at` | TEXT    | NOT NULL, default `datetime('now')` |

Index `idx_shelf_impressions_shelf_id` on `shelf_id`. Freshness = `1 / (1 + countInLast7Days)`, floored at `0.1`. Rows older than 30 days are deleted by the cleanup routine, invoked via the `POST /shelf-impressions/cleanup` endpoint.

## Shelf System

A `ShelfDefinition` is a blueprint that generates one or more `ShelfInstance`s for a user:

```ts
interface ShelfDefinition {
  id: string; // "because-you-watched", "hidden-gems"
  template: boolean; // true = one instance per seed; false = one
  category: 'seed' | 'profile' | 'tmdb' | 'local' | 'context' | 'external';
  pinned?: boolean; // always prepended, bypasses variety caps + min-items
  generate(args: { deps; profile }): ShelfInstance[];
}

interface ShelfInstance {
  shelfId: string; // "because-you-watched:42" or "hidden-gems"
  title: string;
  subtitle?: string;
  emoji?: string;
  query(opts: { limit; offset }): Promise<DiscoverResult[]>;
  score: number; // relevance 0–1
  seedMovieId?: number;
  pinned?: boolean;
}
```

The registry is a frozen array (`getRegisteredShelves()`) — deterministic, no module-load side-effects, no double-registration. `generate` and `query` receive injected `deps` (`{ db, tmdbClient }`) so the pipeline is unit-testable. Template shelf ids append `:seedKey`; static shelves use the bare definition id. A shelf id parses back to its instance via `resolveShelfInstance` (split on `:`, find definition, regenerate, match) for paging.

### The pool (29 definitions)

**Seed templates** (category `seed`, one instance per seed): `because-you-watched` (TMDB recs per watched movie — seeds 60% from last-30-days, 40% older, capped 10), `more-from-director` / `more-from-actor` (above-median-ELO library movies → TMDB credits → `/discover` by `with_crew` / `with_cast`; actor shelf emits one instance per lead-cast slot; credits cached per movie), `top-dimension` (local movies ranked highest on a high-engagement ELO dimension), `dimension-inspired` (TMDB recs from a high-scoring movie for that dimension), `best-in-genre` / `genre-crossover` (top genre affinities; crossover blends two non-related genres).

**Static TMDB** (category `tmdb`): `new-releases` (last 30 days, top genres), `upcoming-releases` (today → +90 days, release-date asc), `hidden-gems` (vote count 50–500, vote avg ≥ 7.0, top genres), `critics-vs-audiences` (vote avg ≥ 8.0, popularity asc), `award-winners` (Academy + Golden Globe keyword ids, top genres), `decade-picks` (most-watched decade's year range), `trending-tmdb` (`/trending/movie/week`), `from-your-watchlist` (TMDB similar to watchlist).

**Local** (category `local`): `recommendations` is category `profile` (top-ELO → TMDB recs, profile-scored; empty below 5 comparisons). `worth-rewatching`, `from-your-server`, `comfort-picks`, `undiscovered`, `recently-added`, `short-watch` (<100 min), `long-epic` (>150 min), `friend-proof`, `polarizing`, `franchise-completions`. `leaving-soon` is **pinned** — surfaces movies leaving rotation even when only one exists. `trending-plex` is category `external` (Plex Discover; empty page when Plex disconnected).

## REST API Surface

`discovery.*` sub-router (ts-rest, projected to OpenAPI):

- `POST /discovery/session` — run full assembly, return `{ shelves: [{ shelfId, title, subtitle, emoji, pinned, items, totalCount, hasMore }] }` with the first 10 items per shelf pre-fetched.
- `GET /discovery/shelves/:shelfId?limit&offset` — page one shelf instance → `{ items, hasMore, totalCount }` (`hasMore` = `items.length === limit`; `totalCount` is null for paged shelves). 404 for an unknown shelf id.

`shelfImpressions.*` sub-router:

- `POST /shelf-impressions` `{ shelfIds[] }` → `{ ok, recorded }`.
- `GET /shelf-impressions/recent?days` → per-shelf counts in the window.
- `GET /shelf-impressions/freshness?shelfId&days` → `{ impressionCount, freshness }` (404 when the shelf has no impressions in the window).
- `POST /shelf-impressions/cleanup` → run retention cleanup (idempotent).

The sibling `discovery.*` section endpoints (`trending`, `recommendations`, `context-picks`, `genre-spotlight`, `quick-pick`, `rewatch-suggestions`, `from-your-server`, `profile`, `dismiss`/`undismiss`/`dismissed`) back the same shelves and the legacy section views. Local-shelf poster URLs point at the byte route `/media/images/movie/{tmdbId}/poster.jpg` (served directly from `MEDIA_IMAGES_DIR`, not part of this contract).

## Assembly Algorithm

1. Compute the preference profile once; load the 7-day impression counts.
2. For each definition, `generate` instances. Pinned instances are set aside (always prepended). Each non-pinned instance gets `baseScore = score × freshness`.
3. Target `[10, 15]` shelves (env-tunable). Weighted-random sampling from candidates, where the per-pick weight applies a **variety bonus** (+0.2 when category differs from the last pick) and a **context boost** (+0.3 for `context` shelves).
4. Variety caps enforced during selection: max 3 `seed`, max 2 genre (`best-in-genre` + `genre-crossover`), max 1 `local` per sliding window of 3.
5. Guarantee at least one personal shelf (`recommendations` or `because-you-watched`) — swap into the last slot if absent.
6. Fetch the first page of every selected shelf in parallel; a failing `query` yields an empty shelf rather than failing the session.
7. Drop too-thin shelves (< 3 items; pinned shelves only need ≥ 1), record impressions for the surfaced set, return them in order (pinned first).

## Business Rules

- Assembly runs on every page load; the shelf selection is never cached. Page composition varies via weighted-random selection + freshness, not item shuffling.
- `because-you-watched` seed rotation: 60% from last-30-days watches, 40% random older, capped at 10 seeds.
- Credits (director/actor) seed from above-median-ELO library movies; TMDB credits fetched lazily and cached per movie.
- Genre crossover excludes related pairs: Action+Adventure, Mystery+Thriller, Drama+Romance, Fantasy+Science Fiction.
- Dimension shelves require ≥ 5 comparisons on a dimension to activate.
- Dismissed movies are filtered from every profile-scored TMDB shelf; `from-your-server` / dimension / local shelves drop dismissed ids via the loaded flag sets.
- `franchise-completions` is approximated by genre overlap with watched movies (no `belongs_to_collection` data yet).
- Freshness floors at 0.1 so a shelf is never permanently suppressed by over-exposure.

## Edge Cases

| Case                        | Behaviour                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------- |
| New user, no watches        | Seed shelves generate nothing; trending / new-releases / context carry the page         |
| Small or empty library      | Local shelves return empty and fall below the min-items filter; TMDB shelves fill in    |
| < 5 comparisons             | `recommendations` returns empty; dimension shelves inactive                             |
| TMDB call fails for a shelf | That shelf's `query` returns empty and is dropped; other shelves unaffected             |
| Plex disconnected           | `trending-plex` returns an empty page and is filtered out                               |
| All shelves recently shown  | Freshness floor (0.1) keeps least-recently-shown shelves competitive                    |
| Movie leaving rotation      | `leaving-soon` (pinned) surfaces even a single title, bypassing the min-items threshold |

## Acceptance Criteria

- [x] `ShelfDefinition` / `ShelfInstance` interfaces with `generate({ deps, profile })`, injected deps, optional `pinned`
- [x] Frozen registry via `getRegisteredShelves()` (29 definitions); `resolveShelfInstance` reconstructs an instance from a shelf id for paging
- [x] `shelf_impressions` table (id, shelf_id, shown_at), index on shelf_id; record / recent-counts / freshness (`1/(1+n)`, floor 0.1) / 30-day cleanup
- [x] `assembleSession` returns 10–15 ordered instances: relevance × freshness scoring, weighted-random selection, variety bonus (+0.2) and context boost (+0.3), caps (3 seed / 2 genre / 1 local-per-3), guaranteed personal shelf, pinned-first
- [x] `POST /discovery/session` runs generate → score → select → parallel first-page fetch → drop < 3-item shelves (pinned need ≥ 1) → record impressions
- [x] `GET /discovery/shelves/:shelfId` pages a single instance; 404 for unknown ids
- [x] `shelfImpressions.*` REST sub-router (record / recent / freshness / cleanup)
- [x] Seed shelves: because-you-watched (60/40 rotation, cap 10), director/actor (above-median ELO, cached credits, per-cast-slot actor instances), dimension + dimension-inspired (≥ 5 comparisons), best-in-genre, genre-crossover (related pairs excluded)
- [x] TMDB shelves: new-releases, upcoming-releases, hidden-gems, critics-vs-audiences, award-winners, decade-picks — all profile-scored, dismissed filtered
- [x] Local shelves: from-your-server, recently-added, short/long watch, comfort, undiscovered, polarizing, friend-proof, franchise-completions (genre-overlap approximation), worth-rewatching, leaving-soon (pinned)
- [x] Existing sections wrapped as shelves: trending-tmdb, trending-plex (external, empty when disconnected), recommendations (profile, empty < 5 comparisons), from-your-watchlist
- [x] DiscoverPage calls `assembleSession` on mount, renders shelves in order as horizontal rows, skeleton while loading
- [x] Off-screen shelves lazy-load via IntersectionObserver (placeholder until visible); "Show more" pages via `getShelfPage` and dedupes by tmdbId
- [x] Refresh button re-runs assembly (disabled while fetching); new selection + impressions
- [x] `/media/calendar` redirects to `/media/discover`

## Out of Scope

- TV-show shelves (movie-only)
- Collaborative filtering, AI-generated titles, editorial/curated shelves
- Streaming-availability integration
  </content>
  </invoke>
