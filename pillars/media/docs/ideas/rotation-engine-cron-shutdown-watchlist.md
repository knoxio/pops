# Rotation engine: real cron, drained shutdown, watchlist-clears-leaving, root-folder disk

Three deferred gaps and one fidelity fix split out of the shipped **rotation-engine** PRD. None are blocking; the engine works on its fixed-interval timer with watchlist exclusion enforced at selection time. Build these to close the loop with the original intent.

## 1. Honour the cron expression (currently inert)

The scheduler stores and edits `rotation_cron_expression` but the timer runs on a fixed interval (`MEDIA_ROTATION_INTERVAL_MS`, default 24h) — `cron-parser` / `node-cron` are not workspace deps, so `nextRunAt` is just `now + intervalMs`. A user setting `0 3 * * *` does not get a 3 AM run.

- Add a cron parser as a media-pillar dependency.
- Drive `armDelayMs` and `nextRunAt` off the parsed expression instead of the interval; keep the interval as the fallback when no/invalid cron is set.
- Touch only `armDelayMs` + `nextRunAt` in `rotation-scheduler.ts` (the controller header already flags this as the intended swap point).

## 2. Drain the in-progress cycle on shutdown

`server.ts` `shutdown` calls `rotationScheduler.stop(db)` and closes the server immediately. A cycle mid-flight (Radarr deletes/adds in progress) is not awaited — `stop` only clears the timer and the `isCycleRunning` guard is ignored at exit.

- Add a `waitForCycleEnd()` to the scheduler that resolves once the current cycle settles.
- In the SIGTERM/SIGINT path, `await` it (with a sane bound) before `server.close()` so a partial Radarr mutation can't be cut off.

## 3. Clearing `leaving` when a movie is re-watchlisted

The PRD intent: marking a `leaving` movie, then adding it to the watchlist, should immediately clear its `leaving` status. Today that side-effect does not exist — the watchlist add flow never touches rotation state. Watchlist movies are still safe from _new_ marks (the selection query excludes them), but one already marked stays `leaving` until its window expires or the user hits "Keep" (cancel-leaving).

- On successful watchlist insert (movie type), call into the rotation removal queries to clear `leaving` for that movie id — a single side-effect after insertion, no new endpoint.
- Cover with a test: mark leaving → watchlist add → status is `null`.

## 4. Pick the disk where the Radarr root folder lives

`getRadarrDiskSpace` uses `disks[0]` (Radarr's first reported disk). On a multi-disk Radarr host this can measure the wrong volume.

- Match the disk whose `path` is the prefix of the configured `RADARR_ROOT_FOLDER_PATH` instead of blindly taking the first entry.
- Fall back to `disks[0]` only when no disk matches.
