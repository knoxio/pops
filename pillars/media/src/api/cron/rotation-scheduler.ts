/**
 * In-process rotation-cycle scheduler (slice 11b).
 *
 * Re-architected from the monolith's `node-cron` task to a recursive
 * `setTimeout` driven by a MODULE-LEVEL singleton controller, mirroring
 * `plex-scheduler.ts`: the `server.ts` boot path and the REST
 * `/rotation/scheduler/{toggle,run-now}` handlers all drive the SAME timer,
 * and the next tick is armed only AFTER the current cycle resolves (no
 * pile-up). One immediate tick fires on `start`.
 *
 * Cron-vs-interval decision: `cron-parser` / `node-cron` are NOT workspace
 * dependencies of `@pops/media`, so per the migration runbook this controller
 * runs on a fixed INTERVAL (env `MEDIA_ROTATION_INTERVAL_MS`, default daily)
 * rather than parsing a cron expression. The monolith's
 * `rotation_cron_expression` is still read/persisted as stored config (the FE
 * settings surface keeps editing it) but does not drive the timer; `nextRunAt`
 * is computed from the interval. Swap in a cron parser later by replacing
 * `armDelayMs` + `nextRunAt` only.
 *
 * Persisted state lives in `rotation_settings` (`rotation_enabled` +
 * `rotation_cron_expression`); `resumeIfEnabled` reads it on boot.
 */
import { type MediaDb, rotationLogService, rotationSettingsService } from '../../db/index.js';
import { getRotationCyclePolicy } from '../modules/rotation-cycle-policy.js';
import { emptyResult } from '../modules/rotation-cycle-types.js';
import { executeRotationCycle } from '../modules/rotation-cycle.js';

const ENABLED_KEY = 'rotation_enabled';
const CRON_KEY = 'rotation_cron_expression';
const DEFAULT_CRON = '0 3 * * *';
const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface RotationSchedulerStatus {
  isRunning: boolean;
  isCycleRunning: boolean;
  intervalMs: number;
  cronExpression: string;
  lastCycleAt: string | null;
  lastCycleError: string | null;
  nextRunAt: string | null;
}

interface SchedulerState {
  db: MediaDb;
  intervalMs: number;
  cronExpression: string;
  timer: NodeJS.Timeout | undefined;
}

let state: SchedulerState | null = null;
let isCycleRunning = false;
let lastCycleAt: string | null = null;
let lastCycleError: string | null = null;
let nextRunAt: string | null = null;

function resolveDefaultIntervalMs(): number {
  const raw = process.env['MEDIA_ROTATION_INTERVAL_MS'];
  if (raw === undefined || raw === '') return DEFAULT_INTERVAL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MS;
}

function persistEnabled(db: MediaDb, cronExpression: string): void {
  rotationSettingsService.set(db, ENABLED_KEY, 'true');
  rotationSettingsService.set(db, CRON_KEY, cronExpression);
}

function persistDisabled(db: MediaDb): void {
  rotationSettingsService.set(db, ENABLED_KEY, 'false');
}

/**
 * Run one cycle, writing exactly one `rotation_log` row. A concurrent call
 * (cycle already running) writes a skipped row and returns without re-entering
 * the cycle, matching the monolith's single-flight guard.
 */
async function runCycle(db: MediaDb): Promise<void> {
  if (isCycleRunning) {
    const policy = getRotationCyclePolicy(db);
    rotationLogService.writeCycleLog(db, {
      ...emptyResult(policy.targetFreeGb),
      skippedReason: 'Concurrent cycle already running',
    });
    return;
  }

  isCycleRunning = true;
  try {
    const result = await executeRotationCycle(db);
    rotationLogService.writeCycleLog(db, result);
    lastCycleAt = new Date().toISOString();
    lastCycleError = result.skippedReason;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastCycleAt = new Date().toISOString();
    lastCycleError = `Cycle error: ${message}`;
    const policy = getRotationCyclePolicy(db);
    rotationLogService.writeCycleLog(db, {
      ...emptyResult(policy.targetFreeGb),
      skippedReason: lastCycleError,
    });
  } finally {
    isCycleRunning = false;
  }
}

function arm(): void {
  if (state === null) return;
  const current = state;
  nextRunAt = new Date(Date.now() + current.intervalMs).toISOString();
  current.timer = setTimeout(() => {
    void tick();
  }, current.intervalMs);
}

async function tick(): Promise<void> {
  if (state === null) return;
  const current = state;
  try {
    await runCycle(current.db);
  } catch (err) {
    console.warn('[media-api] rotation scheduler tick failed', err);
  }
  arm();
}

export interface RotationSchedulerStartOptions {
  db: MediaDb;
  intervalMs?: number;
  cronExpression?: string;
}

export const rotationScheduler = {
  /**
   * Arm the recursive timer + fire one cycle immediately. Idempotent: a second
   * `start` clears the prior timer and re-arms with the new options. Persists
   * the enabled flag + cron expression to `rotation_settings`.
   */
  start(options: RotationSchedulerStartOptions): RotationSchedulerStatus {
    if (state?.timer !== undefined) clearTimeout(state.timer);
    const cronExpression =
      options.cronExpression ?? rotationSettingsService.get(options.db, CRON_KEY) ?? DEFAULT_CRON;
    state = {
      db: options.db,
      intervalMs: options.intervalMs ?? resolveDefaultIntervalMs(),
      cronExpression,
      timer: undefined,
    };
    persistEnabled(options.db, cronExpression);
    void tick();
    return rotationScheduler.status(options.db);
  },

  /** Clear the timer + persist the disabled flag. No-op if not running. */
  stop(db: MediaDb): RotationSchedulerStatus {
    if (state?.timer !== undefined) clearTimeout(state.timer);
    persistDisabled(db);
    state = null;
    nextRunAt = null;
    return rotationScheduler.status(db);
  },

  /** Run a single cycle directly (no timer arming). Writes a rotation log. */
  async runOnce(db: MediaDb): Promise<void> {
    await runCycle(db);
  },

  /** Start with the persisted cron if `rotation_enabled` is `'true'`. */
  resumeIfEnabled(db: MediaDb): RotationSchedulerStatus | null {
    if (rotationSettingsService.get(db, ENABLED_KEY) !== 'true') return null;
    const cronExpression = rotationSettingsService.get(db, CRON_KEY) ?? DEFAULT_CRON;
    return rotationScheduler.start({ db, cronExpression });
  },

  status(db: MediaDb): RotationSchedulerStatus {
    return {
      isRunning: state !== null,
      isCycleRunning,
      intervalMs: state?.intervalMs ?? resolveDefaultIntervalMs(),
      cronExpression:
        state?.cronExpression ?? rotationSettingsService.get(db, CRON_KEY) ?? DEFAULT_CRON,
      lastCycleAt,
      lastCycleError,
      nextRunAt,
    };
  },

  /** Reset all in-memory state — for tests only. */
  _reset(): void {
    if (state?.timer !== undefined) clearTimeout(state.timer);
    state = null;
    isCycleRunning = false;
    lastCycleAt = null;
    lastCycleError = null;
    nextRunAt = null;
  },
};
