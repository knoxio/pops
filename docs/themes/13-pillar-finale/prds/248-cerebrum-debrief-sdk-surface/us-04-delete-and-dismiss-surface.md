# US-04: Mount the debrief delete + dismiss procedures on `cerebrumRouter`

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As a media-pillar cleanup / UX call site (the consumer of US-05), I want `pillar('cerebrum').debrief.{deleteByWatchHistoryId, dismiss}` to resolve to real wire endpoints so that watch-row removal cascades into debrief cleanup cross-pillar, and so user-dismissed pending debriefs are persisted through the SDK.

## Acceptance Criteria

- [ ] `apps/pops-cerebrum-api/src/modules/debrief/router.ts` exposes the two procedures:
  - [ ] `deleteByWatchHistoryId({ watchHistoryId })` → `{ deletedSessions: number, deletedResults: number }`. Cascade-deletes `debriefSessions` rows pinned to the given watch row; `debriefResults` cascade via existing FK. Wrapped in a cerebrum-side transaction.
  - [ ] `dismiss({ sessionId })` → `{ data: Session }`. Sets `dismissed = 1` and bumps `updatedAt`. Idempotent on already-dismissed (returns the row, no error).
- [ ] Unit tests against the caller assert:
  - [ ] `deleteByWatchHistoryId({ watchHistoryId: <nonexistent> })` returns `{ deletedSessions: 0, deletedResults: 0 }` (not an error).
  - [ ] `deleteByWatchHistoryId` correctly cascade-deletes `debriefResults` via FK when sessions are removed.
  - [ ] `dismiss({ sessionId: <already-dismissed> })` returns the row with `dismissed = 1`, no state change.
  - [ ] `dismiss({ sessionId: <unknown> })` throws `TRPCError` 404. (Contrast with `get` which returns null — `dismiss` is a state-changing call and 404 is the right shape.)
- [ ] Contract package picks up the new procedures.
- [ ] `pnpm --filter @pops/pops-cerebrum-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `deleteByWatchHistoryId` is called from media-side cleanup paths (e.g. `blacklistMovie` cleaning up associated debrief sessions, or admin un-log flows). Today the cleanup happens via direct SQL because it joins on `watch_history`; post-PRD-248 it's an SDK call.
- `dismiss` matches today's "user clicks dismiss on a pending debrief" UX path. The dispatch endpoint exists today inside `apps/pops-api/src/modules/cerebrum/debrief/...`; PRD-248 just promotes the cross-pillar binding.
- The cascade semantics are critical: if `debriefResults` does NOT cascade via FK in the current schema, surface that as a blocker — the SDK's `deleteByWatchHistoryId` contract assumes cascade. If the FK is missing, a one-line schema change is the prerequisite.
