# Idea: Ingest Media FIFO Retention / Eviction Job

The `ingest_sources` provenance rows and the `markArchived(db, ids)` service exist and are tested, but **nothing calls `markArchived`** — there is no job that bounds the on-disk media tree. `${FOOD_INGEST_DIR}` grows unbounded today. The schema comments, `ingest-storage.ts`, and `serve.ts` all reference a `runEvictionTick` that does not exist in the codebase (no `src/jobs/` dir, no `ingest-eviction.ts`).

## What to build

A periodic eviction tick that caps the media tree by directory count (not bytes):

- `runEvictionTick(db, dir): Promise<EvictionResult>` — walk `${FOOD_INGEST_DIR}/*/`, and when subdir count > 100, delete the oldest by directory mtime until ≤100 remain.
- For each deleted dir: `rm -rf` the directory, then `markArchived(db, [evictedId])`. The row and its path columns are never deleted — they describe where the media used to live.
- Skip directories newer than 60 seconds so the tick never races an in-flight ingest mid-write.
- Schedule it from the worker (cron-style), since the worker already owns the ingest filesystem.

Soft target ~5 GB (avg IG reel 20–50 MB + small derivatives). v1 enforces by count only; if bytes blow past the target, lower the count cap. No dynamic byte-based adjustment.

## Edge cases to cover

| Case                                           | Behaviour                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Ingest crashes mid-write (partial files)       | Worker writes atomically (tmpdir + rename); the mtime walk sweeps orphans.                                        |
| Eviction runs during an in-flight ingest       | 60-second mtime skip protects new dirs.                                                                           |
| Disk full mid-ingest (ENOSPC)                  | Worker marks the ingest failed; next tick may free space.                                                         |
| Operator manually deletes a `<source_id>/` dir | Next tick is a no-op for that id; `archived_at` is not auto-set (out-of-band cleanup is operator responsibility). |

## Acceptance criteria (when built)

- [ ] `runEvictionTick` prunes oldest-mtime subdirs beyond 100 and calls `markArchived` for each.
- [ ] Tick skips dirs younger than 60 seconds.
- [ ] Vitest seeds 105 fake source dirs, runs the tick, asserts the 5 oldest dirs are gone and their 5 rows have `archived_at` populated.
- [ ] Scheduled from the worker config.

## Out of scope (separately deferred)

- The homelab-infra Litestream YAML edit that excludes `${FOOD_INGEST_DIR}` lives in the private infra repo and can't be ticked from this repo. The exclusion is already documented in `AGENTS.md`; the food reference stream config is `infra/litestream/food.yml`.
- Per-byte disk monitoring, cross-ingest dedup, and URL normalisation.
