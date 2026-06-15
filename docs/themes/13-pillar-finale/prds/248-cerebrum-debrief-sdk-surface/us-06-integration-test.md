# US-06: End-to-end integration test for `pillar('cerebrum').debrief.*` + Option D partial-failure behaviour

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As an operator, I want a single integration test that boots `pops-cerebrum-api` + `pops-api`, exercises the full debrief surface end-to-end from a media handler, and proves the Option D partial-failure contract: media-tx-commits-then-cerebrum-call-fails leaves the watch row intact and is recoverable on retry. Wire-level regressions in transport, auth, contract, idempotency, or the swallow-and-log path must be caught at CI time.

## Acceptance Criteria

- [ ] A test under `apps/pops-api/src/__integration__/` (or the established cross-pillar integration test home) that:
  - [ ] Boots `pops-cerebrum-api` (or its in-process router) and the pops-api host registry.
  - [ ] Configures `POPS_INTERNAL_API_KEY` via fixture.
  - [ ] **Happy path.** From a media handler, calls `pillar('cerebrum').debrief.logWatchCompletion(...)` and asserts the session + status rows exist in cerebrum-db post-call.
  - [ ] **Idempotency.** Calls `logWatchCompletion` twice with the same input; asserts end-state matches the single-call case (no duplicate sessions; status rows reset to 0).
  - [ ] **`getByMedia`.** Inserts a session via the SDK, then `getByMedia({ mediaType, mediaId })` returns it. Asserts the denormalised columns are populated and consumed (no SQL inner-join executes — verify via query log or by deleting the source watch_history row and asserting the read still succeeds).
  - [ ] **Option D partial failure.** Configures the transport to fail the next cerebrum call. Calls a media-handler equivalent of `logWatch` that:
    1. Commits the media tx (watch_history row exists post-call).
    2. Calls `logWatchCompletion`, which fails with `PillarCallError`.
    3. The handler swallows the error, logs a structured warning, and returns success.
    4. Test asserts: watch_history row exists, no debrief session, no exception bubbled.
  - [ ] **Self-heal.** Re-runs `logWatch` for the same media after the transport recovers. Asserts the debrief session is created on the second attempt.
  - [ ] **`record`, `dismiss`, `listPending`, `deleteByWatchHistoryId`** all exercised at the wire level with realistic shapes.
  - [ ] **Auth.** Asserts the unauthenticated case (no `POPS_INTERNAL_API_KEY`) throws `PillarServerSdkError` on first call.
- [ ] The test runs as part of the standard `pnpm --filter @pops/pops-api test` pipeline. CI green required for merge.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- The Option D partial-failure test is the load-bearing assertion. It proves the design's correctness end-to-end: the user's watch is preserved, the debrief is recoverable, no exception leaks to the user-facing handler.
- The self-heal test mirrors §3 of [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) — re-running `logWatch` for the same media is the documented self-heal trigger.
- If pops-api already has an integration-test fixture that boots cross-pillar APIs (PRD-247 US-04 may have introduced one), piggyback on it. Don't invent a new harness.
- The denormalisation assertion (post-`deleteByWatchHistoryId` source row, `getByMedia` still works) is the proof that `getByMedia` does not rely on the SQL join. If it does, the test breaks — surface it as a bug.
