# US-06: Daily Cron

> PRD: [Rotation Engine](README.md)

## Description

As a system, I need a scheduled job that orchestrates the full rotation cycle daily so that the library rotates without manual intervention.

## Acceptance Criteria

- [x] A cron-based scheduler runs `runRotationCycle()` at the configured `rotation_cron_expression`
- [x] `runRotationCycle()` executes in order: sync sources → process expired leaving movies (Radarr delete) → measure free space → calculate deficit → mark new leaving movies (oldest first, by size) → measure free space again → add movies from queue (if space permits)
- [x] The scheduler auto-resumes on server startup if `rotation_enabled = true` (same pattern as Plex sync scheduler)
- [x] `rotation.runNow` tRPC endpoint triggers an immediate cycle outside the cron schedule
- [x] Concurrent cycles are prevented — if a cycle is already running, skip the new invocation and log it
- [x] The scheduler respects `rotation_enabled` — toggling off stops future runs, toggling on schedules the next
- [x] Each cycle creates a `rotation_log` entry with all counts, disk space, and skip reasons
- [x] `rotation_log.details` JSON column is populated with per-movie titles (`{ marked, removed, added, failed }`) when any list is non-empty
- [x] Graceful shutdown: in-progress cycle completes before the server exits (SIGTERM/SIGINT handling via `waitForCycleEnd()`)

## Notes

Follow the existing Plex scheduler pattern (`plex/scheduler.ts`): module-level singleton, `setInterval` or node-cron, settings-driven, resume on boot. Consider using `node-cron` for proper cron expression support instead of `setInterval` with fixed intervals.
