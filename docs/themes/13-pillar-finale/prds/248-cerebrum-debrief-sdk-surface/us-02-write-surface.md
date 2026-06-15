# US-02: Mount the debrief write procedures on `cerebrumRouter`

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As a media-pillar call site (the consumer of US-05), I want `pillar('cerebrum').debrief.{record, create, logWatchCompletion}` to resolve to real wire endpoints so the mixed-tx Option D pattern from [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) can be implemented in `log-watch-event.ts`.

## Acceptance Criteria

- [ ] `apps/pops-cerebrum-api/src/modules/debrief/router.ts` exposes the three write procedures:
  - [ ] `record({ sessionId, dimension, result, … })` → `{ data: Result }`. Inserts into `debriefResults`. Per-statement tx.
  - [ ] `create({ watchHistoryId, mediaType, mediaId })` → `{ data: Session }`. Wraps `delete prior pending/active for (mediaType, mediaId)` + `insert new session` in one cerebrum-side `transaction`. Idempotent on retry.
  - [ ] `logWatchCompletion({ watchHistoryId, mediaType, mediaId })` → `{ data: { session: Session, statusRowsUpserted: number } }`. Wraps `createDebriefSession` + `queueDebriefStatus` in one cerebrum-side `transaction`. Idempotent on retry.
- [ ] Procedures bind to the existing service code from `apps/pops-api/src/modules/cerebrum/debrief/...`. No re-implementation; reuse via shared module (per US-01's choice).
- [ ] `apps/pops-cerebrum-api/src/router.ts` mounts `debrief: debriefRouter` under `cerebrumRouter`.
- [ ] Contract package (`packages/contracts-cerebrum/...`) regenerates and the typed proxy `pillar<CerebrumRouter>('cerebrum').debrief.{record, create, logWatchCompletion}` resolves at the type level.
- [ ] Unit tests against the router caller assert:
  - [ ] `create` deletes prior pending/active sessions for the same `(mediaType, mediaId)` before inserting.
  - [ ] `logWatchCompletion` re-runs are no-op on end-state (same session id replaced by new one; status rows idempotent).
  - [ ] `record` rejects an input with a non-existent `sessionId` (TRPCError 404).
- [ ] `pnpm --filter @pops/pops-cerebrum-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `logWatchCompletion` is the Option D entry point. Its idempotency contract is load-bearing — the media-side mixed-tx flow relies on "retry is safe" to absorb partial failure. Tests must prove it (run the call twice with the same input; assert identical end-state).
- The `create` procedure exposes the lower-level shape used by externally-imported watch flows (e.g. an admin tool that needs to seed a debrief session from a backfill). Most callers use `logWatchCompletion` instead.
- The in-monolith `cerebrum.debrief.*` paths (the dispatcher binding) keep working — they share the same handler code. PRD-248 does not break the existing path.
