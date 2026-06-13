# Watch-history mixed-tx writers — migration design

> Audit-only. Implementation lands in follow-up PR(s) against PRD-167 and PRD-168.

This note unblocks the MEDIA full exit (`watch_history`, `media_watchlist`,
`dismissed_discover` — last three tables on `pops.db`). The cutover is held
up by three writers that run cross-pillar transactions on the shared handle.
The question is not "is there a transaction here", it is "what invariant
does that transaction actually protect, and what is the cheapest preserving
shape after the tables are physically split across SQLite files".

## 1. Blocked writers — transaction boundaries

### 1.1 `logWatch` (`apps/pops-api/src/modules/media/watch-history/handlers/log-watch-event.ts`)

Single `getDrizzle().transaction((tx) => …)` covering, in order:

| Step                                   | Table(s) hit                                                    | Pillar target       |
| -------------------------------------- | --------------------------------------------------------------- | ------------------- |
| Read blacklisted/existing entry        | `watchHistory`                                                  | media               |
| Insert new row (`onConflictDoNothing`) | `watchHistory`                                                  | media               |
| Resolve `episode → season → tv_show`   | `episodes`, `seasons`                                           | media               |
| `resetStaleness(target)`               | `comparison_staleness`                                          | media (comparisons) |
| `createDebriefSession(entry.id)`       | `debriefSessions` (delete prior + insert)                       | **cerebrum**        |
| `queueDebriefStatus(target)`           | `comparisonDimensions` (read), `debriefStatus` (upsert per dim) | **cerebrum**        |
| Remove from watchlist if completed     | `mediaWatchlist`                                                | media               |
| `autoRemoveTvShowIfFullyWatched`       | `episodes`, `seasons`, `watchHistory`, `mediaWatchlist`         | media               |
| `resequencePriorities(tx)`             | `mediaWatchlist`                                                | media               |

Five distinct logical concerns inside one transaction. Only the first two
touch `watch_history` itself; the rest are side-effects fanning out into
three different stores.

### 1.2 `blacklistMovie` (`apps/pops-api/src/modules/media/comparisons/service.ts`)

Single `rawDb.transaction(() => …)`:

| Step                                               | Table                             | Pillar              |
| -------------------------------------------------- | --------------------------------- | ------------------- |
| `UPDATE watch_history SET blacklisted = 1 WHERE …` | `watchHistory`                    | media               |
| Find affected dimension ids                        | `comparisons`                     | media (comparisons) |
| `DELETE FROM comparisons WHERE …`                  | `comparisons`                     | media (comparisons) |
| `recalcDimensionElo(dim)` × N                      | `comparisons`, `comparisonScores` | media (comparisons) |

Cross-table but **single-pillar** (everything is in `media.db` post-cutover).
This is not a cross-pillar tx problem — it is a within-media,
across-two-modules-on-one-handle problem and dissolves the moment
`watch_history` lives in `media.db` alongside `comparisons`.

### 1.3 `apps/pops-api/src/modules/media/watchlist/service.ts` writes

`addToWatchlist`, `updateWatchlistEntry`, `removeFromWatchlist`,
`reorderWatchlist`, `removeByMedia`, `resequencePriorities` all still call
`getDrizzle()` / `getDb()` (`pops.db`). Reads were cut over to
`getMediaDrizzle()` in PRD-167 PR 3. The file header is explicit about why:
the cross-module writers in this app (`log-watch-event`,
`plex/sync-watchlist`, `rotation/removal-selection`, discovery and
comparisons readers) hold raw drizzle handles on `mediaWatchlist` and
target `pops.db`; bifurcating writes mid-migration would leave new rows
visible to one handle and not the other.

This is also a within-media problem once `media_watchlist` + `watch_history`
both live in `media.db` — a transaction joining them is fine.

## 2. The actual blocker

Only **one writer** is genuinely cross-pillar:

- `logWatch` reaches into `debriefSessions` and `debriefStatus`, which
  belong to **cerebrum** semantically (post-watch reflection is a cerebrum
  concern, not a media concern; debrief is already discussed under the
  cerebrum pillar in Theme 13's epics).

There is also a cross-pillar **read** path that matters for whatever shape
we pick: `getDebriefByMedia` in `debrief/service.ts` does
`innerJoin(watchHistory, eq(debriefSessions.watchHistoryId, watchHistory.id))`
to find the most recent pending/active session for a media item. Once
`watch_history` lives in `media.db` and `debrief_sessions` lives in
`cerebrum.db`, this join cannot remain a single SQL statement.

Conclusion: the mixed-tx problem reduces to **logWatch ↔ debrief**.
Everything else is bookkeeping that the standard cutover sequence handles.

## 3. Invariant analysis — what does the cross-pillar atomicity protect?

Re-reading `handleCompletion` (lines 90-95 of `log-watch-event.ts`):

```ts
function handleCompletion(tx: Tx, entryId: number, input: LogWatchInput): void {
  const target = resolveCompTarget(tx, input);
  resetStaleness(target.type, target.id);
  createDebriefSession(entryId); // cerebrum
  queueDebriefStatus(target.type, target.id); // cerebrum
}
```

The invariant the wrapping `db.transaction` enforces is: _if a
`watch_history` row was inserted with `completed = 1`, then a pending
`debrief_sessions` row and N `debrief_status` upserts exist_.

Is this load-bearing? Three observations:

1. **No read joins assume both sides exist.** `getDebriefByMedia` returns
   `NotFoundError('Debrief session', …)` if no session exists — the UI is
   expected to handle "no debrief yet" already, because debrief sessions
   can be skipped/dismissed and the original watch entry survives. The
   `debrief_status` table is a per-(media, dimension) queue, also tolerant
   of missing rows (default is "nothing queued").

2. **`createDebriefSession` is already idempotent on re-watch.** It
   deletes prior pending/active sessions for the same media and inserts a
   fresh one. Re-running it after a partial failure produces the same
   end-state. Same for `queueDebriefStatus` (`onConflictDoUpdate` resets
   `debriefed`/`dismissed` to 0). Both are safe to retry.

3. **The watch_history row is the source of truth.** If the watch is
   logged but the debrief side-effects fail, the user can still see "I
   watched this", and the next completion (or a scheduled reconciler)
   re-creates the debrief queue. The reverse — debrief rows orphaned
   without a watch*history entry — \_would* be a bug, but it cannot happen
   in any of the proposed shapes below because the watch_history insert
   is always the first write.

The atomicity is **cautious, not load-bearing**. The system already
tolerates "watched, no debrief yet" as the steady state for the seconds
between insert and the user opening the debrief screen.

## 4. Option evaluation

### A) Move `debrief_*` into media-db

Wrong on semantics. Debrief is a cerebrum concern (reflection on a
consumed artifact); it already shares space with the cerebrum
debrief/engrams epic stubs (PRD-179, PRD-180). Co-locating it with media
to dodge a tx boundary trades a correct pillar boundary for a wrong one.
**Rejected.**

### B) Two-phase / outbox

Insert an `pending_debrief_outbox` row inside the `watch_history` tx, drain
it from a worker into `cerebrum.db`. Correct, durable, and overkill for a
system whose retry semantics are already idempotent and whose failure
window is "a second of staleness on a feature the user opens manually
later". Adds a worker, a table, a polling interval, and observability
surface for a problem that does not require any of them.
**Rejected for this slice** — keep the outbox pattern in reserve for the
finance ledger / external-side-effect cases where it actually pays for
itself.

### C) Move `logWatch` into cerebrum

The orchestrator that fans out to media + cerebrum lives in cerebrum,
treating media's watch*history as a write-only target via SDK. Wrong
direction: logWatch is triggered by media UI flows (manual log, Plex
sync, batch ops), its dominant work is media-side (watchlist removal,
priority resequence, episode→show resolution), and only the \_tail* is
cerebrum. Hoisting it into cerebrum inverts the call graph for one branch
of an otherwise media-shaped function. **Rejected.**

### D) Split the transaction — SDK call from media → cerebrum

Keep `logWatch` in media. Run the media-side writes (`watch_history` +
`mediaWatchlist` + staleness reset + episode/season resolution +
priority resequence) inside one media transaction. After the media tx
commits, call `pillar('cerebrum').debrief.createSession({ watchHistoryId, mediaType, mediaId })`
which encapsulates `createDebriefSession` + `queueDebriefStatus` in a
cerebrum-side transaction.

Failure modes:

- **Media tx fails** → nothing happens. Same as today.
- **Media tx commits, cerebrum call fails** → watch row exists, no debrief.
  Self-healing options: (a) the next `completed = 1` insert for the same
  media re-creates the debrief queue (since `createDebriefSession` deletes
  prior pending/active sessions anyway, there's no duplication risk);
  (b) a periodic reconciler in cerebrum scans for `watch_history` rows
  whose `(media_type, media_id)` has no `debrief_status` row and back-fills.
  Option (a) covers the human flow; (b) is a one-screen cron handler if we
  decide we need belt-and-braces.
- **Cross-pillar read (`getDebriefByMedia`)** → replace the SQL inner-join
  with: cerebrum looks up the session, then asks media SDK for the
  `watch_history` row by id. Two reads instead of one join. Acceptable —
  this endpoint is invoked once per debrief screen open, not on hot paths.

This is the option that matches Theme 13's general direction: pillars
talk via the SDK, atomicity is bounded by a single pillar, eventual
consistency is the default for cross-pillar side-effects, idempotent
write handlers absorb the partial-failure window.

**Recommended.**

## 5. Recommendation: Option D

Implementation outline (for the follow-up PR, not this one):

1. **Cerebrum side** — expose `debrief.logWatchCompletion({ watchHistoryId, mediaType, mediaId })` that wraps `createDebriefSession` + `queueDebriefStatus` in a cerebrum-handle transaction. Idempotent (already is).
2. **Media side** — in `logWatch`:
   - Keep the media-only writes inside the media transaction
     (`watch_history` insert, staleness reset, `mediaWatchlist` removal,
     priority resequence).
   - After `db.transaction(...)` returns successfully, call the cerebrum
     SDK. Swallow + log SDK errors so the user's watch is not lost when
     cerebrum is briefly unavailable; rely on idempotency + reconciler to
     repair.
3. **Cross-pillar read** — rewrite `getDebriefByMedia` to: query cerebrum
   for the latest session for `(mediaType, mediaId)` (cerebrum stores
   `mediaType` + `mediaId` denormalised on `debrief_sessions`, or we
   denormalise it as part of this PR), then call media SDK for the
   `watch_history` row. Drop the SQL inner-join.
4. **`blacklistMovie`** — straightforward once `watch_history` lives in
   `media.db`: the existing transaction stays as-is, just on the media
   handle. No design work needed beyond moving the handle.
5. **Watchlist writes** — straightforward once `watch_history` and
   `media_watchlist` are both on the media handle: cross-module writers
   in `log-watch-event.ts`, `plex/sync-watchlist.ts`,
   `rotation/removal-selection.ts` all switch to `getMediaDrizzle()` in
   lock-step with the cutover PR. No design work needed.

### Schema change required

`debrief_sessions` currently FKs to `watch_history(id)` and joins through
it to find the media item. Denormalise `media_type` + `media_id` onto
`debrief_sessions` as part of the cerebrum-side PR so the cross-pillar
read does not need the join. Cheap migration; preserves
`debriefSessions.watchHistoryId` as a soft reference (same pattern used
elsewhere in the codebase for cross-pillar FKs).

### Estimated effort

~2-3 PRs:

- **PR a** (cerebrum): denormalise `media_type`/`media_id` on
  `debrief_sessions`, add `logWatchCompletion` SDK method, rewrite
  `getDebriefByMedia` to use SDK fan-out. Tests: existing
  `debrief.test.ts` + new partial-failure cases.
- **PR b** (media): refactor `logWatch` to commit media-only tx first,
  then call cerebrum SDK; cut `blacklistMovie` over to media handle; cut
  `watchlist/service.ts` writes over to `getMediaDrizzle()`.
- **PR c**: drop `watch_history`, `media_watchlist`, `dismissed_discover`
  from the shared journal / backfill bridge. MEDIA full exit.

Optional **PR d**: cerebrum reconciler cron for orphaned watch rows.
Defer until we see a real partial failure in logs — premature otherwise.
