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
- [x] `media/watch-history/handlers/query-helpers.ts` — flip to `pillar('cerebrum').debrief.deleteByWatchHistoryId(...)` on the cleanup path. Awaited; aborts the media-side delete on cerebrum failure so the user can retry.
- [x] `media/watch-history/handlers/log-watch-event.ts` — **Option D restructure**:
  - [x] Keep media-side writes (`watch_history` insert, `mediaWatchlist` removal, staleness reset, episode/season resolution, priority resequence) inside `db.transaction(...)`.
  - [x] After the media tx commits successfully, fan out to `pillar('cerebrum').debrief.logWatchCompletion({ watchHistoryId, mediaType, mediaId })` via `cerebrum-fan-out.ts`. The helper is fire-and-forget so `logWatch` keeps its sync signature — required to avoid cascading async into the out-of-scope plex/arr/rotation callers (PRD-248 US-05c scope guard).
  - [x] The fan-out swallows `PillarCallError` (and any failure) with a structured `logger.warn` carrying `watchHistoryId`. **Does not throw** — the watch row is committed; the debrief is recoverable on next watch or via reconciler.
  - [x] Swallow-and-log behaviour documented in `cerebrum-fan-out.ts` with a link to [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) §5.

### Cross-cutting

- [ ] `.dependency-cruiser-known-violations.json` shrinks by the entries this US closes (Sites 4, 5, 6, 7 from PRD-246 US-04).
- [ ] Each affected file has no runtime `@pops/cerebrum-db` import. Type-only imports of `MediaType` / `DebriefDimension` enums are allowed.
- [ ] The `getDebriefByMedia` rewrite confirmed not to use a SQL join — only one SDK call.
- [x] Tests for `log-watch-event` updated to assert:
  - [x] Happy path: media tx commits, SDK call succeeds, debrief session + status rows exist (see `media/debrief/debrief.test.ts > logWatch integration`).
  - [x] Partial failure: media tx commits, SDK call throws. The watch row is still present; no debrief; no exception bubbles to the caller; a structured warning is logged (see `media/watch-history/service.test.ts > cerebrum debrief fan-out (Option D — PRD-248 US-05c)`).
  - [x] Retry: re-running `logWatch` for the same media yields the same end-state (idempotency assertion).
- [ ] `pnpm --filter @pops/pops-api typecheck/test/build` passes clean.
- [ ] Monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- [ ] Husky pre-commit + pre-push pass without `--no-verify`.

## Notes

- US-05 blocks on US-02 + US-03 + US-04 landing first. The surface must exist before consumers can flip.
- The Option D restructure is **structurally** different from the other site flips. It's not a 1:1 method swap; it's a sequencing change: split the tx, commit the media half, fire the cerebrum half as best-effort. Reviewers must verify the order, the swallow, and the logging.
- The `getDebriefByMedia` rewrite drops a SQL join. Verify performance is acceptable — a single denormalised query on `(mediaType, mediaId)` should be faster than the join was; if not, surface a perf gap and circle back to the schema design.
- After this US lands, [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Sites 4, 5, 6, 7 close. Update PRD-246's tracking table in the same PR (or referenced commit).
- The deferred reconciler cron is out of scope. If partial-failure rates exceed the noise floor in production, that's the trigger to file a follow-up.
