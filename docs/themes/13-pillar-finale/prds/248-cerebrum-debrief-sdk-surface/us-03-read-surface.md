# US-03: Mount the debrief read procedures on `cerebrumRouter`

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As a media-pillar reader (the consumer of US-05), I want `pillar('cerebrum').debrief.{get, getByMedia, listPending}` to resolve to real wire endpoints so that the cross-pillar read path drops its SQL inner-join on `watch_history`. The `getByMedia` shape consumes the already-denormalised `mediaType` + `mediaId` columns on `debriefSessions` (commit 9df171fe).

## Acceptance Criteria

- [x] `apps/pops-cerebrum-api/src/modules/debrief/router.ts` exposes the three read procedures:
  - [x] `get({ sessionId })` → `{ data: Session | null }`. Single-row read by primary key.
  - [x] `getByMedia({ mediaType, mediaId })` → `{ data: Session | null }`. Returns the latest pending/active session for the media. **Denormalised** — uses `debriefSessions.mediaType` + `debriefSessions.mediaId` directly, no SQL inner-join with `watch_history`.
  - [x] `listPending({ mediaType?, mediaId?, limit?, offset? })` → `{ data: Session[], pagination: PaginationMeta }`. Paginated list filtered by optional `(mediaType, mediaId)`.
- [x] `getByMedia` returns `null` for "no debrief found" (not a NotFoundError). The cleaner null shape is documented in PRD-248 README's edge-cases table.
- [x] Unit tests against the caller assert:
  - [x] `getByMedia({ mediaType: 'movie', mediaId: 999 })` returns `null` for a media with no debrief.
  - [x] `getByMedia` returns the most recent (by `createdAt desc`) pending/active session when multiple exist (should not happen in steady state, but the read does not assume singleton).
  - [x] `listPending` paginates correctly. Default limit matches the existing `media/debrief` pagination (50; verify at PR time).
  - [x] `get({ sessionId: <unknown> })` returns `{ data: null }`.
- [x] Contract package picks up the new procedures (zod schemas exported from US-01 are mounted directly; no contract regen needed).
- [x] `pnpm --filter @pops/pops-cerebrum-api typecheck/test/build` passes clean.
- [x] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The denormalisation is the architectural reason the cross-pillar read is acceptable. The previous SQL `innerJoin(watchHistory, eq(debriefSessions.watchHistoryId, watchHistory.id))` was the load-bearing blocker.
- `getByMedia` returns `null` instead of throwing `NotFoundError`. Rationale: UI flows already treat "no debrief yet" as a valid steady state (see [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) §3). Throwing a 404 over the wire on a benign no-debrief case is noise.
- The previous in-monolith `getDebriefByMedia` in `media/debrief/service.ts` had its own NotFoundError path. US-05 (the consumer flip) translates that to "null means no debrief" behaviour at the call site.
