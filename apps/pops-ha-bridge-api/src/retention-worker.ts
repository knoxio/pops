/**
 * Daily retention worker for the HA bridge history table (PRD-229 US-01).
 *
 * Runs `pruneHistory` on a recursive `setTimeout` schedule. The recursive
 * pattern (vs `setInterval`) makes the worker easier to test with fake
 * timers and guarantees the next tick is only armed after the current
 * run resolves — so a slow prune cannot pile up overlapping invocations.
 *
 * Errors are logged and the next tick is still scheduled; a transient
 * SQLite failure must not crash the pillar.
 */
import { pruneHistory, type HaBridgeDb } from '@pops/ha-bridge-db';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionWorkerLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

export interface RetentionWorkerOptions {
  db: HaBridgeDb;
  intervalMs?: number;
  retentionDays?: number;
  logger?: RetentionWorkerLogger;
  now?: () => number;
}

export interface RetentionWorkerHandle {
  stop: () => void;
}

export function startRetentionWorker(options: RetentionWorkerOptions): RetentionWorkerHandle {
  const intervalMs = options.intervalMs ?? DAY_MS;
  const retentionDays = options.retentionDays ?? 30;
  const now = options.now ?? Date.now;
  const logger = options.logger;

  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = (): void => {
    try {
      const cutoffMs = now() - retentionDays * DAY_MS;
      const deleted = pruneHistory(options.db, cutoffMs);
      logger?.info?.('ha-bridge retention prune complete', { deleted, retentionDays });
    } catch (err) {
      logger?.warn?.('ha-bridge retention prune failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) {
      timer = setTimeout(tick, intervalMs);
    }
  };

  tick();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
