# app-media Consumer Inventory (PRD-227 follow-up)

Static audit of `packages/app-media/src/` for tRPC consumer call sites that will
need to be cut over to per-pillar SDKs (`@pops/media-sdk`) during the finale.

This document is **audit-only**. No migration in this PR.

## Summary

| Metric                                                                | Value                          |
| --------------------------------------------------------------------- | ------------------------------ |
| Total tRPC call sites (`useQuery` / `useMutation`)                    | **151**                        |
| Files containing at least one call site                               | **61**                         |
| `trpc.useUtils()` consumers (cache invalidation)                      | 32 files                       |
| Calls into `trpc.media.*` (pillar-local)                              | **151**                        |
| Cross-pillar calls (`trpc.core.*`, others)                            | **0**                          |
| Direct `getDrizzle()` usage                                           | 0                              |
| Raw `fetch('/trpc/…')` usage                                          | 0                              |
| Optimistic updates (`utils.*.setData` / `onMutate` for cache writes)  | **14 occurrences across 3 files** |
| `useSuspenseQuery` / `useInfiniteQuery`                               | 0                              |

The package consumes `@pops/api-client` and is otherwise self-contained against
the `media` tRPC namespace. There is no cross-pillar coupling at the call-site
level — every call is `trpc.media.*`.

## Triage

| Bucket      | Count | Definition                                                                                                              | Notes                                                                                                                              |
| ----------- | ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Trivial** | 137   | Single-pillar `trpc.media.*` call, ≤5 LOC delta, query or mutation with at most `utils.media.*.invalidate()`            | The bulk; suitable for the first migration sweep.                                                                                  |
| **Medium**  | 0     | Wrapper-required (cross-router invalidation chain, or `usePillarQuery`-style adapter)                                   | Many `useUtils()` consumers exist, but they all stay inside `media.*` namespace, so they remain trivial for the SDK swap.          |
| **Risky**   | 14    | Optimistic updates via `utils.media.*.setData(...)` and `onMutate` rollback in three files                              | Needs the SDK to expose a typed cache-write surface, or keep `utils` on raw tRPC for these hooks.                                  |

Total = 137 + 0 + 14 = 151 (matches call-site count).

## Risky sites (optimistic cache writes)

These three files perform optimistic updates with `utils.media.*.setData()`
followed by `onMutate`/`onError` rollback. They must wait for the
`@pops/media-sdk` adapter to expose a typed `setData` / cache-write API, or
they need to keep raw tRPC plus a thin compatibility shim.

- `components/watchlist-toggle/useWatchlistToggleModel.ts`
  - Lines 15, 18, 29 (`add` mutation): optimistic toggle of
    `media.watchlist.status` cache.
  - Lines 48, 51, 62 (`remove` mutation): mirror pattern with rollback.
- `pages/tv-show-detail/useTvShowDetailModel.ts`
  - Lines 64, 67, 93 (`batchLog` mutation): optimistic update of
    `media.watchHistory.progress` cache with a snapshot-on-error rollback.
- `pages/season-detail/useBatchSeasonLog.ts`
  - Lines 50, 53, 93, 96, 110 (`onMutate: apply`): batch-season optimistic
    progress and list updates with snapshot rollback.

## Call sites by router (Trivial bucket)

The Trivial bucket spans these `trpc.media.*` sub-routers (call counts
approximate; regenerate from `packages/app-media/src/` if needed):

- `media.arr.*` — Sonarr/Radarr integration; config, queue, calendar, season
  monitoring, request flows (~25 calls across calendar, request-movie,
  request-series, source-management, tv-show detail, season detail).
- `media.comparisons.*` — debrief, dimensions, smart-pair, rankings, tier
  list, blacklist (~40 calls; the largest router).
- `media.discovery.*` — quick-pick, assemble-session, profile, dismiss
  (~7 calls).
- `media.library.*` — list, addMovie, addTvShow, quickPick, genres (~7 calls).
- `media.movies.*` / `media.tvShows.*` — get/list/seasons/episodes (~10 calls).
- `media.plex.*` — sync jobs, status, last results (~4 calls).
- `media.rotation.*` — sources, candidates, exclusions, leaving, rotation log,
  add-to-queue (~25 calls).
- `media.search.*` — movies / tvShows (~2 calls).
- `media.watchHistory.*` — list, log, batchLog, progress, delete, listRecent
  (~12 calls; three of these are the Risky optimistic-update sites).
- `media.watchlist.*` — add, remove, status, list, update, reorder (~15 calls;
  the toggle file is Risky).

## Migration ordering

1. **Trivial (137)** — once `@pops/media-sdk` ships, swap `trpc.media.*` for
   the equivalent SDK hook. The 32 files using `trpc.useUtils()` for
   invalidation are still trivial because all invalidated keys live in
   `media.*`; the SDK invalidate helper covers them directly.
2. **Risky (14)** — defer until the SDK exposes typed `setData` (or accept a
   short-lived hybrid where these three files keep raw tRPC).

## Caveats / unknowns

- Test files (`*.test.ts(x)`) are excluded from the count. They currently mock
  `@pops/api-client` and will need to switch mock targets when the SDK lands.
- `trpc.useUtils()` is counted per file, not per invalidation expression. Some
  files invalidate many sibling queries inside one `useUtils()` block.
- No raw fetch to `/trpc/…` and no `getDrizzle()` — all access goes through
  the typed client.
