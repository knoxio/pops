# US-02: Plugin Lifecycle

> PRD: [PRD-090: Plugin Architecture](README.md)
> Status: Done

## Description

As the Cerebrum system, I need a plugin lifecycle manager that handles adapter registration, initialization, periodic health checks, and shutdown with error isolation so that one failing adapter cannot crash the system or affect other adapters.

## Acceptance Criteria

- [x] A `PlexusLifecycleManager` class manages the full adapter lifecycle: register (store config, create DB row) → initialize (call `adapter.initialize()`, transition to `healthy` on success or `error` on failure) → running (periodic health checks) → shutdown (call `adapter.shutdown()`, remove from active adapters)
- [x] Registration creates a `plexus_adapters` row with `status: registered` and stores the adapter configuration. The adapter's `initialize()` method is called immediately after registration — successful initialization transitions to `healthy`, failure transitions to `error` with the error message stored in `last_error`
- [x] Periodic health checks run every 5 minutes (configurable) for all `healthy` or `degraded` adapters by calling `adapter.healthCheck()`. A healthy response resets error state. A single failure transitions from `healthy` to `degraded`. Three consecutive failures transition to `error`
- [x] Error isolation: each adapter runs in its own error boundary — `try/catch` around all adapter method calls. Unhandled exceptions or promise rejections from an adapter are caught, logged with adapter context, and the adapter transitions to `error` status. Other adapters continue operating normally
- [x] An `error` status adapter is disabled — no sync operations are attempted. The user must manually re-initialize via `cerebrum.plexus.adapters.register` (or a re-initialize API) to recover
- [x] Health check timeout: if `healthCheck()` does not resolve within 10 seconds, it is treated as a failure
- [x] On system shutdown, `shutdown()` is called on all active adapters in parallel with a 5-second timeout — adapters that do not shut down within the timeout are abandoned
- [x] The lifecycle manager exposes an `isHealthy(adapterId)` method that other components (e.g., Reflex, Emit) can check before dispatching work to an adapter

## Notes

- Error isolation is the most critical requirement — a misbehaving email adapter should never prevent the GitHub adapter from syncing.
- Health check intervals should be staggered across adapters (not all checked at the same second) to avoid burst load.
- The "three consecutive failures" threshold for transitioning to `error` provides tolerance for transient issues (network blip, API rate limit) while catching persistent problems.
- Consider emitting a notification (shell + Moltbot) when an adapter transitions to `error` status — the user should know when an integration is broken.
