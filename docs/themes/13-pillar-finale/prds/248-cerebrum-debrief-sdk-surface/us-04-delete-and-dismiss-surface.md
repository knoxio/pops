# US-04: Mount the debrief delete + dismiss procedures on `cerebrumRouter`

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As a media-pillar cleanup / UX call site (the consumer of US-05), I want `pillar('cerebrum').debrief.{deleteByWatchHistoryId, dismiss}` to resolve to real wire endpoints so that watch-row removal cascades into debrief cleanup cross-pillar, and so user-dismissed pending debriefs are persisted through the SDK.

## Acceptance Criteria

- [x] `apps/pops-cerebrum-api/src/modules/debrief/router.ts` exposes the two procedures:
  - [x] `deleteByWatchHistoryId({ watchHistoryId })` → `{ deletedSessions: number, deletedResults: number }`. Cascade-deletes `debriefSessions` rows pinned to the given watch row; `debriefResults` are deleted explicitly inside the same cerebrum-side transaction because the `0055_debrief_baseline.sql` migration intentionally drops the FK so the cerebrum SQLite file can stand alone.
  - [x] `dismiss({ sessionId })` → `{ data: Session }`. Transitions the session to the `status = 'complete'` terminal state — the session-level "dismissed" marker for the SDK contract (the row has no `dismissed` boolean; that flag lives on the per-(media, dimension) `debrief_status` rows). Idempotent on an already-complete session (returns the row, no state change). Wrapped in a cerebrum-side transaction.
- [x] Unit tests against the caller assert:
  - [x] `deleteByWatchHistoryId({ watchHistoryId: <nonexistent> })` returns `{ deletedSessions: 0, deletedResults: 0 }` (not an error).
  - [x] `deleteByWatchHistoryId` correctly cascade-deletes the dependent `debriefResults` rows alongside the parent sessions.
  - [x] `dismiss({ sessionId: <already-dismissed/complete> })` returns the same row, no further state change.
  - [x] `dismiss({ sessionId: <unknown> })` throws `TRPCError` 404. (Contrast with `get` which returns null — `dismiss` is a state-changing call and 404 is the right shape.)
- [x] Contract package picks up the new procedures (`cerebrum.debrief.dismiss` + `cerebrum.debrief.deleteByWatchHistoryId` are already present in the OpenAPI snapshot from US-01; in-monolith dispatcher binding added in lockstep so both surfaces match).
- [x] `pnpm --filter @pops/cerebrum-api typecheck/test/build` passes clean.
- [x] Monorepo `pnpm typecheck`, `pnpm lint` pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `deleteByWatchHistoryId` is called from media-side cleanup paths (e.g. `blacklistMovie` cleaning up associated debrief sessions, or admin un-log flows). Today the cleanup happens via direct SQL because it joins on `watch_history`; post-PRD-248 it's an SDK call.
- `dismiss` matches today's "user clicks dismiss on a pending debrief" UX path. The dispatch endpoint exists today inside `apps/pops-api/src/modules/cerebrum/debrief/...`; PRD-248 just promotes the cross-pillar binding.
- Cascade semantics: the `0055_debrief_baseline.sql` migration intentionally drops the `debrief_results.session_id` FK so the cerebrum SQLite file can stand alone. `deleteByWatchHistoryId` therefore performs the cascade explicitly inside the same transaction (delete dependent results first, then sessions) instead of relying on the FK. No schema change required.
