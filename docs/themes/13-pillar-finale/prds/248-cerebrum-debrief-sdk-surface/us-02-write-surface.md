# US-02: Mount the debrief write procedures on `cerebrumRouter`

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As a media-pillar call site (the consumer of US-05), I want `pillar('cerebrum').debrief.{record, create, logWatchCompletion}` to resolve to real wire endpoints so the mixed-tx Option D pattern from [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) can be implemented in `log-watch-event.ts`.

## Acceptance Criteria

- [x] `apps/pops-cerebrum-api/src/modules/debrief/router.ts` exposes the three write procedures:
  - [x] `record({ sessionId, dimensionId, comparisonId })` → `{ data: DebriefResult }`. Inserts into `debriefResults`. Per-statement tx.
  - [x] `create({ watchHistoryId, mediaType, mediaId })` → `{ data: DebriefSession }`. Wraps `delete prior pending/active for (mediaType, mediaId)` + `insert new session` in one cerebrum-side `transaction`. Idempotent on retry.
  - [x] `logWatchCompletion({ watchHistoryId, mediaType, mediaId })` → `{ sessionId, dimensionsQueued }` (per the US-01 OpenAPI snapshot). Wraps the session delete-then-insert in one cerebrum-side `transaction`. Idempotent on retry. `dimensionsQueued` is `0` until US-05 reshapes the dimension lookup — `comparison_dimensions` lives in `media.db` and the cerebrum-api container has no media-db handle, so the status fan-out is deferred to the in-monolith dispatcher binding meanwhile.
- [x] Procedures bind to the cerebrum-db tables through `ctx.cerebrumDb` (matching the `nudges` router convention). The in-monolith service code at `apps/pops-api/src/modules/cerebrum/debrief/...` keeps serving the dispatcher binding until US-05 flips the call sites.
- [x] `apps/pops-cerebrum-api/src/router.ts` mounts `debrief: debriefRouter` under `cerebrumRouter`.
- [x] Contract package (`@pops/cerebrum-contract`) regenerates and the typed proxy `pillar<CerebrumRouter>('cerebrum').debrief.{record, create, logWatchCompletion}` resolves at the type level. (Wire shapes inherited from US-01 schemas; `CerebrumRouter` remains opaque per the PRD-155 declaration-bundler plan.)
- [x] Unit tests against the router caller assert:
  - [x] `create` deletes prior pending/active sessions for the same `(mediaType, mediaId)` before inserting.
  - [x] `logWatchCompletion` re-runs converge on one pending session row (same media tuple, fresh session id).
  - [x] `record` rejects an input with a non-existent `sessionId` (TRPCError 404).
- [x] `pnpm --filter @pops/cerebrum-api typecheck/test/build` passes clean.
- [x] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [x] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- `logWatchCompletion` is the Option D entry point. Its idempotency contract is load-bearing — the media-side mixed-tx flow relies on "retry is safe" to absorb partial failure. Tests must prove it (run the call twice with the same input; assert identical end-state).
- The `create` procedure exposes the lower-level shape used by externally-imported watch flows (e.g. an admin tool that needs to seed a debrief session from a backfill). Most callers use `logWatchCompletion` instead.
- The in-monolith `cerebrum.debrief.*` paths (the dispatcher binding) keep working — they share the same handler code. PRD-248 does not break the existing path.
- The response shape for `logWatchCompletion` follows the US-01 OpenAPI snapshot (`{ sessionId, dimensionsQueued }`), not the earlier `{ data: { session, statusRowsUpserted } }` placeholder. `dimensionsQueued` stays `0` until US-05 introduces a cerebrum-readable dimension source (or reshapes the call-sites to enumerate dimensions on the media side).
