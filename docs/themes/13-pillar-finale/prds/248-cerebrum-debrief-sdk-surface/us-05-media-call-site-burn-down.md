# US-05: Flip the 4 media-side debrief call sites to `pillar('cerebrum').debrief.*` (with Option D)

> PRD: [PRD-248 — cerebrum.debrief.\* cross-pillar SDK surface](README.md)

## Description

As an `apps/pops-api` media-pillar maintainer, I want every `@pops/cerebrum-db` import under media-side debrief handlers flipped to `await pillar('cerebrum').debrief.*`, with the mixed-tx case in `log-watch-event.ts` restructured to the Option D pattern from [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md). This US is the consumer side of PRD-248 (US-02..US-04 ship the surface); jointly it closes [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Sites 4, 5, 6, 7.

## Acceptance Criteria

### Per-file

- [ ] `media/comparisons/lib/debrief-record.ts` — flip to `pillar('cerebrum').debrief.record(...)`. Drop runtime `@pops/cerebrum-db` import.
- [ ] `media/comparisons/lib/debrief-dismiss.ts` — flip to `pillar('cerebrum').debrief.dismiss(...)`.
- [ ] `media/comparisons/lib/debrief-pending.ts` — flip to `pillar('cerebrum').debrief.listPending(...)`.
- [ ] `media/debrief/service.ts` — flip `createDebriefSession` calls to `pillar('cerebrum').debrief.create(...)` (or `logWatchCompletion(...)` where the queue upsert is wanted). Rewrite `getDebriefByMedia` to call `pillar('cerebrum').debrief.getByMedia(...)` — drop the SQL inner-join on `watch_history`. Translate "null returned" to the in-pillar `NotFoundError` shape if the existing UI handler depends on it.
- [ ] `media/debrief/queue-status.ts` — flip its reads to `pillar('cerebrum').debrief.get(...)` / `getByMedia(...)`.
- [ ] `media/watch-history/handlers/query-helpers.ts` — flip reads to SDK.
- [ ] `media/watch-history/handlers/log-watch-event.ts` — **Option D restructure**:
  - [ ] Keep media-side writes (`watch_history` insert, `mediaWatchlist` removal, staleness reset, episode/season resolution, priority resequence) inside `db.transaction(...)`.
  - [ ] After the media tx commits successfully, call `await pillar('cerebrum').debrief.logWatchCompletion({ watchHistoryId, mediaType, mediaId })`.
  - [ ] Wrap the SDK call in `try/catch`: on `PillarCallError` with `kind: 'pillar-unavailable'` or any cerebrum-side failure, log a structured warning with `watchHistoryId` and return success. **Do not throw** — the watch row is committed; the debrief is recoverable on next watch or via reconciler.
  - [ ] Document the swallow-and-log behaviour inline with a comment that links to [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) §5.

### Cross-cutting

- [ ] `.dependency-cruiser-known-violations.json` shrinks by the entries this US closes (Sites 4, 5, 6, 7 from PRD-246 US-04).
- [ ] Each affected file has no runtime `@pops/cerebrum-db` import. Type-only imports of `MediaType` / `DebriefDimension` enums are allowed.
- [ ] The `getDebriefByMedia` rewrite confirmed not to use a SQL join — only one SDK call.
- [ ] Tests for `log-watch-event` updated to assert:
  - [ ] Happy path: media tx commits, SDK call succeeds, debrief session + status rows exist.
  - [ ] Partial failure: media tx commits, SDK call throws `PillarCallError`. The watch row is still present; no debrief; no exception bubbles to the caller; a structured warning is logged.
  - [ ] Retry: re-running `logWatch` for the same media yields the same end-state (idempotency assertion).
- [ ] `pnpm --filter @pops/pops-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- US-05 blocks on US-02 + US-03 + US-04 landing first. The surface must exist before consumers can flip.
- The Option D restructure is **structurally** different from the other site flips. It's not a 1:1 method swap; it's a sequencing change: split the tx, commit the media half, fire the cerebrum half as best-effort. Reviewers must verify the order, the swallow, and the logging.
- The `getDebriefByMedia` rewrite drops a SQL join. Verify performance is acceptable — a single denormalised query on `(mediaType, mediaId)` should be faster than the join was; if not, surface a perf gap and circle back to the schema design.
- After this US lands, [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Sites 4, 5, 6, 7 close. Update PRD-246's tracking table in the same PR (or referenced commit).
- The deferred reconciler cron is out of scope. If partial-failure rates exceed the noise floor in production, that's the trigger to file a follow-up.
