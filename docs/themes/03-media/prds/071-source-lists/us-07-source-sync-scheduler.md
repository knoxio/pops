# US-07: Source Sync Scheduler

> PRD: [Source Lists](README.md)

## Description

As a system, I need to periodically sync rotation sources so that the candidate queue stays populated with fresh movies from all configured sources.

## Acceptance Criteria

- [x] `syncAllSources()` iterates enabled sources where `last_synced_at + sync_interval_hours` has elapsed (or `last_synced_at` is null)
- [x] Each source is synced independently — one source failing does not block others
- [x] Source sync runs before the rotation cycle's addition step (called from `runRotationCycle` in PRD-070 US-06)
- [x] `rotation.sources.syncNow(sourceId)` tRPC endpoint triggers an immediate sync for a single source
- [x] Sync results are logged: source name, candidates found, new candidates added, errors
- [x] Concurrent sync calls for the same source are prevented (skip if already syncing)
- [x] Stale candidates (source no longer returns them for 30 days) are marked with lower priority, not deleted

## Notes

Source sync is triggered as part of the rotation cycle, not as an independent scheduler. This keeps the timing simple: sync sources → select candidates → add movies. The per-source `sync_interval_hours` prevents unnecessary API calls when sources update infrequently.
