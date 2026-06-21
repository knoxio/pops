/**
 * Hard-eviction ticker for external pillars (Theme 13 PRD-228 US-02).
 *
 * Runs every 30s in core-api. On each pass:
 *
 *   1. Read every row in `pillar_registry`.
 *   2. Pick rows where `origin = 'external'`, `status = 'unavailable'`,
 *      and `statusUpdatedAt` is older than `EVICTION_THRESHOLD_MS`
 *      (5 minutes by default).
 *   3. DELETE the row.
 *   4. Emit a `deregistered` event with `reason = 'never-heartbeated'`
 *      (if the row never recorded a heartbeat past registration) or
 *      `'lost-heartbeat'` (if it ever flipped to healthy first) plus
 *      the wall-clock `evictedAt`.
 *
 * `origin = 'internal'` rows are NEVER hard-evicted regardless of
 * status — internal pillars manage their own lifecycle via the
 * in-network deregister route (canonical `/registry/deregister`, legacy
 * `/core.registry.deregister`).
 *
 * The router's lazy-status compute (`computeStatus` from
 * `./status.js`) flips `unavailable` after 30s of missed heartbeats;
 * the eviction threshold is layered on top of that so a transient
 * outage doesn't drop the row immediately.
 *
 * Errors are logged and the next tick runs normally — no backoff. The
 * register endpoint accepts repeat registrations, so an evicted pillar
 * that comes back simply re-registers.
 */
import { pillarRegistryService, type CoreDb, type PillarRegistration } from '../../../db/index.js';
import { emitRegistryEvent, type DeregisterReason } from './event-bus.js';
import { computeStatus, registryNow } from './status.js';

export const EVICTION_TICK_INTERVAL_MS = 30_000;
export const EVICTION_THRESHOLD_MS = 5 * 60_000;

export interface EvictionTickerOptions {
  readonly intervalMs?: number;
  readonly thresholdMs?: number;
  readonly onEvicted?: (eviction: EvictionRecord) => void;
  readonly onError?: (error: unknown) => void;
}

export interface EvictionRecord {
  readonly pillarId: string;
  readonly reason: DeregisterReason;
  readonly evictedAt: string;
}

export type StopEvictionTicker = () => void;

function chooseReason(row: PillarRegistration): DeregisterReason {
  return row.lastHeartbeatAt === row.registeredAt ? 'never-heartbeated' : 'lost-heartbeat';
}

function shouldEvict(row: PillarRegistration, now: Date, thresholdMs: number): boolean {
  if (row.origin !== 'external') return false;
  const liveStatus =
    row.status === 'unknown' ? 'unknown' : computeStatus(new Date(row.lastHeartbeatAt), now);
  if (liveStatus !== 'unavailable') return false;
  return now.getTime() - Date.parse(row.statusUpdatedAt) >= thresholdMs;
}

function evictRow(db: CoreDb, row: PillarRegistration, nowIso: string): EvictionRecord {
  const reason = chooseReason(row);
  pillarRegistryService.deletePillarRegistration(db, row.pillarId);
  emitRegistryEvent({
    event: 'deregistered',
    pillarId: row.pillarId,
    entry: null,
    origin: 'external',
    reason,
    evictedAt: nowIso,
  });
  return { pillarId: row.pillarId, reason, evictedAt: nowIso };
}

/**
 * Run a single eviction pass synchronously. Exported for tests so they
 * can drive the ticker deterministically without `setInterval`.
 *
 * Returns the evictions that were applied so tests can assert on the
 * count without subscribing through `onEvicted`.
 */
export function runEvictionTick(
  db: CoreDb,
  options?: { now?: Date; thresholdMs?: number; onEvicted?: (eviction: EvictionRecord) => void }
): readonly EvictionRecord[] {
  const now = options?.now ?? registryNow();
  const threshold = options?.thresholdMs ?? EVICTION_THRESHOLD_MS;
  const nowIso = now.toISOString();

  const evictions: EvictionRecord[] = [];
  for (const row of pillarRegistryService.listPillarRegistrations(db)) {
    if (!shouldEvict(row, now, threshold)) continue;
    evictions.push(evictRow(db, row, nowIso));
  }

  if (options?.onEvicted) {
    for (const eviction of evictions) {
      options.onEvicted(eviction);
    }
  }
  return evictions;
}

/**
 * Start the periodic eviction ticker. Returns a stop function suitable
 * for SIGTERM wiring. First tick runs after `intervalMs`; tests use
 * `runEvictionTick` directly.
 */
export function startEvictionTicker(
  db: CoreDb,
  options?: EvictionTickerOptions
): StopEvictionTicker {
  const intervalMs = options?.intervalMs ?? EVICTION_TICK_INTERVAL_MS;
  const thresholdMs = options?.thresholdMs ?? EVICTION_THRESHOLD_MS;
  const handle = setInterval(() => {
    try {
      runEvictionTick(db, { thresholdMs, onEvicted: options?.onEvicted });
    } catch (error) {
      if (options?.onError) {
        options.onError(error);
      } else {
        console.error('[core-api] eviction ticker error', error);
      }
    }
  }, intervalMs);
  if (typeof handle.unref === 'function') handle.unref();
  return () => clearInterval(handle);
}
