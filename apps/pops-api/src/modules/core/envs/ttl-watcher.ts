/**
 * TTL watcher — periodically purges expired environments.
 * Uses setInterval rather than per-env timers so it survives process restarts.
 *
 * Lifecycle notes:
 *  - The interval handle is returned to callers so it can be cleared on graceful
 *    shutdown (see index.ts).
 *  - On a hard crash the OS terminates the process and all intervals stop; any envs
 *    that expired during the downtime are cleaned up by startupCleanup() on the next
 *    startup, so no manual intervention is needed.
 *  - Tests do NOT call startTtlWatcher() — they invoke deleteExpiredEnvs() directly
 *    so no leaked intervals are created in the test process.
 */
import { deleteExpiredEnvs } from "./registry.js";

const INTERVAL_MS = 30_000; // 30 seconds

/**
 * Start the TTL watcher.
 * Returns the interval handle so callers can clear it on shutdown.
 */
export function startTtlWatcher(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    try {
      const deleted = deleteExpiredEnvs();
      if (deleted.length > 0) {
        console.log(`[env-watcher] Purged expired environments: ${deleted.join(", ")}`);
      }
    } catch (err) {
      console.error("[env-watcher] Error purging expired environments:", err);
    }
  }, INTERVAL_MS);
}
