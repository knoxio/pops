/**
 * Background status-reconciliation ticker for the pillar registry
 * (Theme 13 PRD-162).
 *
 * Runs every `HEARTBEAT_INTERVAL_MS` (10s by default) inside core-api.
 * On each pass:
 *   1. Read every row in `pillar_registry`.
 *   2. For each row, compute live status from `lastHeartbeatAt`.
 *   3. Apply transitions (status differs from persisted) inside a
 *      single SQLite transaction. Each transition stamps
 *      `statusUpdatedAt = now`.
 *   4. Healthy-staleness refresh: persisted `healthy` rows whose
 *      `statusUpdatedAt` is older than `HEALTHY_STALENESS_REFRESH_MS`
 *      get their `statusUpdatedAt` bumped to `now` so the timestamp
 *      reflects "still alive as of this moment" (used by PRD-164's
 *      restart reconciliation).
 *
 * Errors are logged and the next tick runs normally — no backoff. The
 * lazy compute path inside the router is the authoritative status for
 * snapshot reads, so a delayed tick only delays event emission.
 *
 * Subscription events (PRD-163) are not yet wired up. Transitions are
 * delivered through the optional `onTransition` callback so the
 * subscription layer can plug in without touching this file.
 */
import {
  pillarRegistryService,
  type ApplyStatusUpdate,
  type CoreDb,
  type PillarRegistration,
  type StatusTransition,
} from '../../../db/index.js';
import {
  HEALTHY_STALENESS_REFRESH_MS,
  HEARTBEAT_INTERVAL_MS,
  computeStatus,
  registryNow,
} from './status.js';

export interface HeartbeatTickerOptions {
  readonly intervalMs?: number;
  readonly onTransition?: (transition: StatusTransition) => void;
  readonly onError?: (error: unknown) => void;
}

export type StopTicker = () => void;

/**
 * Run a single reconciliation pass synchronously. Exported for tests
 * so they can drive the ticker deterministically without setInterval.
 *
 * Returns the transitions that were persisted (so tests can assert on
 * counts without subscribing to `onTransition`).
 */
export function runHeartbeatTick(
  db: CoreDb,
  options?: { now?: Date; onTransition?: (transition: StatusTransition) => void }
): readonly StatusTransition[] {
  const now = options?.now ?? registryNow();
  const nowIso = now.toISOString();
  const rows = pillarRegistryService.listPillarRegistrations(db);

  const updates: ApplyStatusUpdate[] = [];
  const transitions: StatusTransition[] = [];

  for (const row of rows) {
    const computed = computeStatus(parseHeartbeat(row), now);
    if (computed !== row.status) {
      updates.push({
        pillarId: row.pillarId,
        status: computed,
        statusUpdatedAt: nowIso,
      });
      transitions.push({
        pillarId: row.pillarId,
        previousStatus: row.status,
        nextStatus: computed,
        at: nowIso,
      });
      continue;
    }
    if (
      row.status === 'healthy' &&
      now.getTime() - Date.parse(row.statusUpdatedAt) > HEALTHY_STALENESS_REFRESH_MS
    ) {
      updates.push({
        pillarId: row.pillarId,
        status: row.status,
        statusUpdatedAt: nowIso,
      });
    }
  }

  pillarRegistryService.applyStatusUpdates(db, updates);

  if (options?.onTransition) {
    for (const transition of transitions) {
      options.onTransition(transition);
    }
  }
  return transitions;
}

function parseHeartbeat(row: PillarRegistration): Date {
  return new Date(row.lastHeartbeatAt);
}

/**
 * Start the periodic ticker. Returns a stop function suitable for
 * SIGTERM wiring. The first tick runs after `intervalMs`; tests that
 * want a synchronous pass call `runHeartbeatTick` directly.
 */
export function startHeartbeatTicker(db: CoreDb, options?: HeartbeatTickerOptions): StopTicker {
  const intervalMs = options?.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const handle = setInterval(() => {
    try {
      runHeartbeatTick(db, { onTransition: options?.onTransition });
    } catch (error) {
      if (options?.onError) {
        options.onError(error);
      } else {
        console.error('[core-api] heartbeat ticker error', error);
      }
    }
  }, intervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  return () => clearInterval(handle);
}
