/**
 * Heartbeat-driven status computation for the pillar registry
 * (Theme 13 PRD-162).
 *
 * The registry persists `lastHeartbeatAt` per pillar; the status column
 * is a denormalised cache. Live status is recomputed from
 * `lastHeartbeatAt` on every read (via `computeStatus`) so consumers
 * always see fresh state — the persisted column drives only the
 * background ticker's transition emission.
 *
 * Rules (per PRD spec):
 *   - 3 missed heartbeats at the 10s SDK cadence ⇒ `unavailable`.
 *   - Boundary (NOW − last == 30000ms) is owned by `unavailable`.
 *   - Negative ages (pillar clock ahead of core-api) are treated as
 *     `healthy` — defensive, but the docker network keeps clocks tight.
 */

export const HEARTBEAT_INTERVAL_MS = 10_000;
export const MISS_THRESHOLD = 3;
export const UNAVAILABLE_AFTER_MS = HEARTBEAT_INTERVAL_MS * MISS_THRESHOLD;

export const HEALTHY_STALENESS_REFRESH_MS = 60_000;

export type LivePillarStatus = 'healthy' | 'unavailable';

export function computeStatus(lastHeartbeatAt: Date, now: Date): LivePillarStatus {
  const ageMs = now.getTime() - lastHeartbeatAt.getTime();
  return ageMs < UNAVAILABLE_AFTER_MS ? 'healthy' : 'unavailable';
}

/**
 * Test seam: `injectRegistryClock(() => fixedDate)` overrides the
 * default `() => new Date()` reference used by the ticker and router.
 * Tests advance simulated time without waiting on real intervals.
 *
 * Pass `null` (or call `resetRegistryClock`) to restore the default.
 */
type Clock = () => Date;
let currentClock: Clock = () => new Date();

export function injectRegistryClock(clock: Clock | null): void {
  currentClock = clock ?? (() => new Date());
}

export function resetRegistryClock(): void {
  currentClock = () => new Date();
}

export function registryNow(): Date {
  return currentClock();
}
