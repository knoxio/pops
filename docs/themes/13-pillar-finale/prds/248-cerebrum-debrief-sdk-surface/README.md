# PRD-248: `cerebrum.debrief.*` cross-pillar SDK surface (unblock media → cerebrum debrief burn-down)

> Epic: [Cross-pillar code placement](../../epics/08b-cross-pillar-code-placement.md)
>
> Status: **Not started** — scoping PRD. Direct unblock for [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Sites 4, 5, 6, 7 (the media → cerebrum debrief cluster).

## Overview

[PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Sites 4–7 cover the four media-pillar files that reach into `@pops/cerebrum-db`'s `debriefSessions`, `debriefResults`, `debriefStatus` tables in mixed transactions. PRD-246's "Out of Scope" forbids designing the SDK shape that would unblock them: _"No new SDK type machinery."_ Today `pops-cerebrum-api`'s root router exposes only `nudges` — no `debrief.*`.

PRD-248 is the scoping PRD that defines `pillar('cerebrum').debrief.*` and codifies the **Option D mixed-transaction pattern** from [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md): _commit media-side tx first, then fire the cerebrum SDK call; rely on idempotent writes + (optional) reconciler to absorb partial failure._ The SDK surface is shaped to that pattern — `record`, `dismiss`, `listPending`, `create`, `get`, `getByMedia`, `logWatchCompletion`, `deleteByWatchHistoryId` — and not to a transactional one.

PRD-248 builds on PRD-247's server-side `pillar('<other>').*` consumer pattern (the [server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md) doc PRD-247 US-02 ships). PRD-248 inherits the async / `PillarCallError` / service-account-auth conventions and does not re-derive them.

The denormalisation already landed: commit `9df171fe` added `media_type` + `media_id` columns to `debrief_sessions`, removing the SQL inner-join on `watch_history` that previously blocked the cross-pillar read. PRD-248's read surface (`getByMedia`) consumes that denormalised shape directly.

## Background

### The 4 blocked call sites (audit verified)

| Site                                                                                | Methods called                                                                          | Mixed-tx shape                                                  |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `media/comparisons/lib/debrief-record.ts`                                           | Insert / upsert into `debriefResults` after a comparison decision                       | Single cerebrum write, no media-side tx; pattern A              |
| `media/comparisons/lib/debrief-dismiss.ts`, `debrief-pending.ts`                    | Dismiss a pending debrief; list pending debriefs for a media item                       | Cerebrum-only read/update; pattern A                            |
| `media/debrief/service.ts`, `media/debrief/queue-status.ts`                         | Create + read debrief sessions; read queue status                                       | Mostly cerebrum-only; `getByMedia` joins through watch_history  |
| `media/watch-history/handlers/query-helpers.ts` + `log-watch-event.ts`              | Inside `logWatch` tx: `createDebriefSession` + `queueDebriefStatus` (the mixed-tx case) | Media tx commits first, then `logWatchCompletion` SDK call      |

The [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) note is the canonical design — read it in full before authoring US-04. Key invariant findings from §3 of that note:

- The cross-pillar atomicity is **cautious, not load-bearing**. The user-facing UI already tolerates "watched, no debrief yet" as the steady state for the seconds between insert and the user opening the debrief screen.
- `createDebriefSession` is **already idempotent** on re-watch (deletes prior pending/active sessions for the same media, inserts a fresh one).
- `queueDebriefStatus` is **already idempotent** (`onConflictDoUpdate` resets `debriefed` / `dismissed` to 0).
- A reconciler cron handler can backfill orphaned watch rows. Defer until partial-failure logs justify it.

### Surface inventory (the 8 methods)

Distilled from the audit + the design doc:

| Method                                                  | Direction | Site(s) consumed by                                      | Notes                                                                                                 |
| ------------------------------------------------------- | --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `record({ … })`                                         | Write     | `comparisons/lib/debrief-record.ts`                       | Insert a debrief result row after a comparison decision.                                              |
| `dismiss({ sessionId })`                                | Write     | `comparisons/lib/debrief-dismiss.ts`                      | Mark a pending session as dismissed.                                                                  |
| `listPending({ mediaType?, mediaId? })`                 | Read      | `comparisons/lib/debrief-pending.ts`                      | Enumerate pending debriefs (filter by media if provided).                                             |
| `create({ watchHistoryId, mediaType, mediaId })`        | Write     | `media/debrief/service.ts`                                | Create a debrief session pinned to a watch_history row.                                               |
| `get({ sessionId })`                                    | Read      | `media/debrief/service.ts`, `queue-status.ts`             | Fetch a session by id.                                                                                |
| `getByMedia({ mediaType, mediaId })`                    | Read      | `media/debrief/service.ts`                                | Find latest pending/active session for a media item. Consumes the denormalised `media_type`/`media_id`. |
| `logWatchCompletion({ watchHistoryId, mediaType, mediaId })` | Write     | `media/watch-history/handlers/log-watch-event.ts`         | Encapsulates `createDebriefSession` + `queueDebriefStatus` in one cerebrum-side tx. Idempotent.       |
| `deleteByWatchHistoryId({ watchHistoryId })`            | Write     | `media/watch-history/handlers/...` (cleanup on un-log)    | Cascade-delete debrief rows when a watch_history row is removed (e.g. blacklist, un-log).             |

The surface deliberately includes both `create` and `logWatchCompletion`. `create` is the lower-level shape (a single session row); `logWatchCompletion` is the orchestration shape (session + queued status, idempotent). The mixed-tx Option D wraps `logWatchCompletion`. Other callers (e.g. a direct API to create a session for an externally-imported watch) use `create`.

## Surface

| Surface                                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/pops-cerebrum-api/src/modules/debrief/router.ts` (new)             | Mount `debrief.{record, dismiss, listPending, create, get, getByMedia, logWatchCompletion, deleteByWatchHistoryId}` on `cerebrumRouter`. Implementation reuses the existing cerebrum service code (currently inside `apps/pops-api/src/modules/cerebrum/debrief/...`; promote it to the cerebrum-api package or import it shared, per US-01's call). All writes are wrapped in cerebrum-side `getCerebrumDrizzle().transaction(...)`.                       |
| `apps/pops-cerebrum-api/src/router.ts`                                   | `cerebrumRouter` adds `debrief: debriefRouter`. Procedure paths become `cerebrum.debrief.*`.                                                                                                                                                                                                                                                                                                                                                              |
| `packages/contracts-cerebrum/src/...` (per [PRD-153](../153-contract-package-scaffold/README.md))   | Generated contract package picks up the new procedures. The typed proxy `pillar<CerebrumRouter>('cerebrum').debrief.*` exposes the surface to media callers.                                                                                                                                                                                                                                                                                              |
| `apps/pops-api/src/modules/cerebrum/debrief/...`                         | In-monolith handlers stay; they continue to serve the in-pillar dispatcher binding for `cerebrum.debrief.*`. PRD-248 only ensures the procedure shapes match (or reuses the same router code if the architectural setup permits — US-01 picks).                                                                                                                                                                                                            |
| 4 media-side files under `apps/pops-api/src/modules/media/`              | Flip direct `@pops/cerebrum-db` imports to `await pillar('cerebrum').debrief.<m>(...)`. The mixed-tx case (`log-watch-event.ts`) restructures to commit media-tx first, then fire `logWatchCompletion`. The cross-pillar read (`getDebriefByMedia` in `media/debrief/service.ts`) replaces its SQL inner-join with a `getByMedia` call (denormalised, no join needed).                                                                                       |

### Wire shape highlights

- **`record({ sessionId, dimension, result, … })`** — zod input mirrors the existing `debriefResults` insert shape. Returns the inserted row.
- **`dismiss({ sessionId })`** — sets `dismissed = 1` + bumps `updatedAt`. Idempotent on already-dismissed.
- **`listPending({ mediaType?, mediaId?, limit?, offset? })`** — paginated list of pending sessions. Used by the comparisons UI's "pending debriefs" panel.
- **`create({ watchHistoryId, mediaType, mediaId })`** — inserts a session; deletes prior pending/active for the same `(mediaType, mediaId)` first (matches today's `createDebriefSession`).
- **`get({ sessionId })`** — returns `Session | null`.
- **`getByMedia({ mediaType, mediaId })`** — returns the latest pending/active session for the media. **Denormalised** — uses `debriefSessions.mediaType` + `debriefSessions.mediaId` directly, no join.
- **`logWatchCompletion({ watchHistoryId, mediaType, mediaId })`** — wraps `createDebriefSession` + `queueDebriefStatus` in one cerebrum-side tx. Idempotent. This is the **Option D entry point** for the mixed-tx flow.
- **`deleteByWatchHistoryId({ watchHistoryId })`** — cascade-deletes `debriefSessions` rows pinned to the given watch row. Sister sessions' `debriefResults` cascade via the existing FK; the SDK call returns `{ deletedSessions: number, deletedResults: number }`.

### Option D — the mixed-tx contract

The media-side call site does:

```ts
db.transaction((tx) => {
  // media-side writes: watch_history insert, mediaWatchlist removal, staleness reset, etc.
  // ... all inside the media tx.
});

// after the media tx commits successfully:
try {
  await pillar('cerebrum').debrief.logWatchCompletion({ watchHistoryId, mediaType, mediaId });
} catch (err) {
  if (err instanceof PillarCallError) {
    logger.warn({ err, watchHistoryId }, 'cerebrum debrief queue deferred — will self-heal on next watch or reconciler');
    return; // do not throw — the watch was logged successfully
  }
  throw err;
}
```

The pattern is documented in the [server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md) note (PRD-247 US-02). PRD-248's US-05 codifies the swallow-and-log behaviour for the specific `logWatchCompletion` case.

## Business Rules

- **All cross-pillar writes are async + best-effort after media-tx commit.** No outbox table, no two-phase commit, no compensating tx. The user's watch is the source of truth; debrief side-effects are reconstructible.
- **`logWatchCompletion` is idempotent on retry.** Re-running it for the same `(watchHistoryId, mediaType, mediaId)` produces the same end-state (deletes prior pending session, inserts fresh, upserts queue rows). Callers may retry on transient failure; no de-dup token is required.
- **`getByMedia` reads the denormalised columns.** The SQL inner-join on `watch_history` is gone (commit 9df171fe). The cross-pillar read is one cerebrum query, not a fan-out.
- **`PillarCallError` from `logWatchCompletion` is logged-and-swallowed.** The media flow does not surface the error to the user. A pending self-heal happens either at next watch (idempotent re-creation) or via the reconciler cron (deferred — see Out of Scope).
- **`PillarCallError` from `record`, `dismiss`, `listPending`, `getByMedia` IS surfaced.** These are user-initiated actions; the UI must surface the failure to the user (toast / error state). The mixed-tx swallowing only applies to `logWatchCompletion` (and any other side-effect-only write that lands later).
- **Cerebrum-side `transaction` boundary is per-call.** `logWatchCompletion` wraps `createDebriefSession` + `queueDebriefStatus` in one cerebrum-side tx (matching today's semantics). Other procedures use the default per-statement tx mode.
- **Inherits PRD-247 conventions.** Async signatures, `PillarCallError` discrimination, service-account auth, discovery-cache. See [server-pillar-sdk-consumer-pattern](../../notes/server-pillar-sdk-consumer-pattern.md).

## Edge Cases

| Case                                                                                                       | Behaviour                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Media tx commits, `logWatchCompletion` call fails                                                          | The error is logged with `watchHistoryId` and swallowed. The watch row exists; no debrief queue. Self-heal triggers on the next completion for the same media (idempotent re-create) or via the deferred reconciler cron. UI shows "no debrief yet" — already a tolerated state.                       |
| `logWatchCompletion` succeeds, then the same media is re-watched                                           | The new call deletes the previous pending session and inserts a fresh one (matches today). The `debrief_status` upserts reset `debriefed` / `dismissed` to 0. The previously-pending session is dropped — no historical debrief queue for this media item. Matches today's behaviour.                  |
| `getByMedia` is called for a media item with no debrief                                                    | Returns `null`. UI treats null as "no debrief yet". Matches today's `NotFoundError('Debrief session', …)` behaviour but as a null return instead of an exception (cleaner shape for cross-pillar reads).                                                                                               |
| `dismiss` is called for an already-dismissed session                                                       | No-op. Returns the session row. Idempotent.                                                                                                                                                                                                                                                              |
| `deleteByWatchHistoryId` is called for a watch row with no debrief                                         | Returns `{ deletedSessions: 0, deletedResults: 0 }`. Not an error.                                                                                                                                                                                                                                       |
| `record({ sessionId })` is called for a non-existent session                                               | Returns `PillarCallError` with `kind: 'tRPCError'` / `code: 'NOT_FOUND'`. The UI surfaces it.                                                                                                                                                                                                            |
| `cerebrum-api` is unavailable                                                                              | `record` / `dismiss` / etc. throw `PillarCallError` with `kind: 'pillar-unavailable'`. User-initiated calls surface the error; `logWatchCompletion` swallows-and-logs.                                                                                                                                  |
| `listPending` called with no filters                                                                       | Returns all pending sessions, paginated. Default limit matches the existing `media/debrief` pagination shape.                                                                                                                                                                                            |
| Media-tx-then-SDK-call sequence is interrupted mid-flight (process crash between tx commit and SDK call)   | Watch row exists; no debrief. Same end-state as "SDK call fails". Self-heal applies.                                                                                                                                                                                                                     |
| A future call site needs a transactional cross-pillar write (e.g. "either both succeed or both roll back") | Out of scope for PRD-248. The Option D pattern is "media-side first, cerebrum-side best-effort". If a future case needs strict atomicity, design an outbox in a successor PRD per the `media-watch-history-mixed-tx-design.md` §4-B rejected option (deferred until pain).                              |

## User Stories

| #   | Story                                                                                       | Summary                                                                                                                                                                                                                                                               | Parallelisable                              |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 01  | [us-01-debrief-schema-and-types](us-01-debrief-schema-and-types.md)                         | Promote the debrief zod schemas + types to a shared module reachable from both `pops-api` (in-pillar) and `pops-cerebrum-api` (cross-pillar). No router code yet. Verifies the denormalised `media_type`/`media_id` columns on `debriefSessions` are queryable.       | Foundational — blocks US-02..US-04          |
| 02  | [us-02-write-surface](us-02-write-surface.md)                                               | Mount the write procedures on `cerebrumRouter`: `record`, `create`, `logWatchCompletion`. Each wraps its writes in a cerebrum-side transaction. `logWatchCompletion` is the Option D entry point.                                                                     | Blocked by US-01; can split per-procedure   |
| 03  | [us-03-read-surface](us-03-read-surface.md)                                                 | Mount the read procedures: `get`, `getByMedia` (denormalised, no join), `listPending`. Paginated where appropriate.                                                                                                                                                  | Blocked by US-01; parallel with US-02       |
| 04  | [us-04-delete-and-dismiss-surface](us-04-delete-and-dismiss-surface.md)                     | Mount `deleteByWatchHistoryId` + `dismiss`. Cascade-delete semantics for the former; idempotent dismiss for the latter.                                                                                                                                                | Blocked by US-01; parallel with US-02 / 03  |
| 05  | [us-05-media-call-site-burn-down](us-05-media-call-site-burn-down.md)                       | Flip the 4 media-side files to `pillar('cerebrum').debrief.*`. Implement the Option D mixed-tx pattern in `log-watch-event.ts`. Rewrite `getDebriefByMedia` to use `getByMedia` (no SQL inner-join). Drop the cross-pillar imports + matching allow-list entries.       | Blocked by US-02 + US-03 + US-04            |
| 06  | [us-06-integration-test](us-06-integration-test.md)                                         | End-to-end test: boot pops-cerebrum-api + pops-api, drive `logWatchCompletion` from a media handler, assert idempotency on retry, assert media-tx-commits-then-cerebrum-fails leaves the watch row intact, assert `getByMedia` returns the denormalised shape. | Blocked by US-05                            |

US-01 is foundational. US-02, US-03, US-04 are independent slices of the surface and parallelisable. US-05 (the consumer-side burn-down) blocks on all three surface USs landing. US-06 is the wire-level proof.

## Acceptance Criteria

Tracked per-US — summary here for orientation:

- `pops-cerebrum-api`'s `cerebrumRouter` exposes `debrief.{record, dismiss, listPending, create, get, getByMedia, logWatchCompletion, deleteByWatchHistoryId}` with zod-validated inputs / outputs.
- The contract package emits typed procedure handles for `pillar<CerebrumRouter>('cerebrum').debrief.*`.
- The 4 media-side files (`media/comparisons/lib/debrief-{record,dismiss,pending}.ts`, `media/debrief/{service,queue-status}.ts`, `media/watch-history/handlers/{query-helpers,log-watch-event}.ts`) contain no runtime `@pops/cerebrum-db` import after the burn-down. Type-only imports of denormalised column names are allowed.
- `log-watch-event.ts` implements Option D: media-tx commits, then `logWatchCompletion` is fired with swallow-and-log on `PillarCallError`.
- `getDebriefByMedia` (media-side) uses `pillar('cerebrum').debrief.getByMedia` — no SQL inner-join.
- Matching `.dependency-cruiser-known-violations.json` entries removed.
- Integration test boots both APIs and asserts wire-level correctness + idempotency + Option D partial-failure behaviour.
- `pnpm --filter @pops/pops-cerebrum-api typecheck/test/build`, `pnpm --filter @pops/pops-api typecheck/test/build`, and monorepo `pnpm typecheck`, `pnpm lint`, `pnpm build` pass clean.
- Husky pre-commit + pre-push pass without `--no-verify`.

## Out of Scope

- **Outbox / two-phase commit for the media → cerebrum mixed-tx case.** Rejected by [`media-watch-history-mixed-tx-design.md`](../../notes/media-watch-history-mixed-tx-design.md) §4-B. Option D (best-effort post-commit) is the chosen shape.
- **Reconciler cron for orphaned watch rows.** Optional follow-up per the design doc §5. Defer until partial-failure logs justify it.
- **Co-locating debrief inside media.** Rejected by the design doc §4-A. Debrief is a cerebrum concern.
- **Hoisting `logWatch` into cerebrum.** Rejected by the design doc §4-C. The orchestrator stays media-side.
- **Cross-pillar SQL joins.** The `getByMedia` shape relies on the already-landed denormalisation (commit 9df171fe). No cross-pillar SQL allowed.
- **Pulling `core.embeddings.*` into PRD-248.** Scoped to PRD-249. The two surfaces share the cerebrum pillar but not the design space.
- **Migrating finance-related corrections / tag-rules.** Those sit under Epic 08a / PRD-203 directory relocation; explicitly punted by PRD-246 US-04 update.

## References

- [PRD-246](../246-shell-api-pillar-decoupling/README.md) US-04 Sites 4–7 — the consumer this surface unblocks
- [PRD-247](../247-core-settings-sdk-surface/README.md) — sibling cross-pillar SDK PRD; shares the consumer-pattern doc
- [PRD-242](../242-dynamic-approuter/README.md) — typed `pillar()` proxy
- [PRD-153](../153-contract-package-scaffold/README.md) — contract-package scaffold that picks up the new procedures
- [PRD-156](../156-consumer-import-discipline/README.md) — gates new H8 violations; PRD-248 shrinks its allow-list (via US-05)
- [ADR-026 — Pillar architecture](../../../../architecture/adr-026-pillar-architecture.md)
- [ADR-027 — Runtime pillar registry](../../../../architecture/adr-027-runtime-pillar-registry.md)
- [Media ↔ cerebrum mixed-tx design](../../notes/media-watch-history-mixed-tx-design.md) — Option D, the canonical pattern
- [Server pillar SDK consumer pattern](../../notes/server-pillar-sdk-consumer-pattern.md) — async / error / auth conventions inherited from PRD-247 US-02
- [Pillar isolation audit](../../notes/pillar-isolation-audit.md) §H8 — Sites 4–7
- Commit `9df171fe` — denormalised `media_type` + `media_id` on `debrief_sessions`
- `apps/pops-cerebrum-api/src/router.ts` — where the new `debriefRouter` mounts
- `apps/pops-api/src/modules/cerebrum/debrief/` — existing in-monolith implementation reused by US-02..US-04
