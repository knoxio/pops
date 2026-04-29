import { CronExpressionParser } from 'cron-parser';
import { eq } from 'drizzle-orm';
import cron, { type ScheduledTask } from 'node-cron';

/**
 * Rotation scheduler — daily cron job orchestrating the full rotation cycle.
 *
 * The cycle implementation lives in `rotation-cycle.ts`; the rotation log
 * writer in `rotation-log.ts`; shared types in `rotation-cycle-types.ts`.
 *
 * PRD-070 US-06
 */
import { settings } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { isEnabled } from '../../core/features/index.js';
import { emptyResult } from './rotation-cycle-types.js';
import { executeRotationCycle } from './rotation-cycle.js';
import { writeRotationLog } from './rotation-log.js';

export {
  emptyResult,
  type RotationCycleResult,
  type RotationFailedMovieRef,
  type RotationMovieRef,
} from './rotation-cycle-types.js';

const SETTINGS_KEYS = {
  enabled: 'rotation_enabled',
  cronExpression: 'rotation_cron_expression',
  targetFreeGb: 'rotation_target_free_gb',
  leavingDays: 'rotation_leaving_days',
} as const;

const DEFAULT_CRON = '0 3 * * *';
const DEFAULT_TARGET_FREE_GB = 100;
const DEFAULT_LEAVING_DAYS = 7;

export interface RotationSchedulerStatus {
  isRunning: boolean;
  isCycleRunning: boolean;
  cronExpression: string;
  lastCycleAt: string | null;
  lastCycleError: string | null;
  nextRunAt: string | null;
}

let task: ScheduledTask | null = null;
let cronExpression = DEFAULT_CRON;
let isCycleRunning = false;
let lastCycleAt: string | null = null;
let lastCycleError: string | null = null;

function getSetting(key: string): string | null {
  const db = getDrizzle();
  const record = db.select().from(settings).where(eq(settings.key, key)).get();
  return record?.value ?? null;
}

function saveSetting(key: string, value: string): void {
  const db = getDrizzle();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run();
}

function deleteSetting(key: string): void {
  const db = getDrizzle();
  db.delete(settings).where(eq(settings.key, key)).run();
}

function getTargetFreeGb(): number {
  const val = getSetting(SETTINGS_KEYS.targetFreeGb);
  return val ? Number(val) : DEFAULT_TARGET_FREE_GB;
}

function getLeavingDays(): number {
  const val = getSetting(SETTINGS_KEYS.leavingDays);
  return val ? Number(val) : DEFAULT_LEAVING_DAYS;
}

export function startRotationScheduler(options?: {
  cronExpression?: string;
}): RotationSchedulerStatus {
  if (task) return getRotationSchedulerStatus();
  cronExpression =
    options?.cronExpression ?? getSetting(SETTINGS_KEYS.cronExpression) ?? DEFAULT_CRON;

  task = cron.schedule(cronExpression, () => {
    void runRotationCycle();
  });

  saveSetting(SETTINGS_KEYS.enabled, 'true');
  saveSetting(SETTINGS_KEYS.cronExpression, cronExpression);
  console.warn(`[Rotation] Scheduler started (cron: ${cronExpression})`);
  return getRotationSchedulerStatus();
}

export function stopRotationScheduler(): RotationSchedulerStatus {
  if (task) {
    void task.stop();
    task = null;
  }
  deleteSetting(SETTINGS_KEYS.enabled);
  deleteSetting(SETTINGS_KEYS.cronExpression);
  console.warn('[Rotation] Scheduler stopped');
  return getRotationSchedulerStatus();
}

export function getRotationSchedulerStatus(): RotationSchedulerStatus {
  let nextRunAt: string | null = null;
  if (task && cronExpression) {
    try {
      const interval = CronExpressionParser.parse(cronExpression);
      nextRunAt = interval.next().toISOString();
    } catch {
      // Invalid cron — leave null
    }
  }
  return {
    isRunning: task !== null,
    isCycleRunning,
    cronExpression,
    lastCycleAt,
    lastCycleError,
    nextRunAt,
  };
}

export function resumeRotationSchedulerIfEnabled(): RotationSchedulerStatus | null {
  if (!isEnabled('media.rotation')) return null;
  const savedCron = getSetting(SETTINGS_KEYS.cronExpression) ?? DEFAULT_CRON;
  console.warn(`[Rotation] Auto-resuming scheduler (cron: ${savedCron})`);
  return startRotationScheduler({ cronExpression: savedCron });
}

export async function runRotationCycleNow(): Promise<ReturnType<
  typeof executeRotationCycle
> | null> {
  if (isCycleRunning) {
    console.warn('[Rotation] Cycle already in progress — skipping');
    return null;
  }
  return runRotationCycle();
}

export async function runRotationCycle(): Promise<
  Awaited<ReturnType<typeof executeRotationCycle>>
> {
  if (isCycleRunning) {
    const result = {
      ...emptyResult(getTargetFreeGb()),
      skippedReason: 'Concurrent cycle already running',
    };
    writeRotationLog(result);
    return result;
  }

  isCycleRunning = true;
  const targetFreeGb = getTargetFreeGb();
  const leavingDays = getLeavingDays();

  try {
    const result = await executeRotationCycle({ targetFreeGb, leavingDays });
    writeRotationLog(result);
    lastCycleAt = new Date().toISOString();
    lastCycleError = result.skippedReason;
    console.warn(
      `[Rotation] Cycle complete: ${result.moviesRemoved} removed, ${result.moviesMarkedLeaving} marked leaving, ${result.moviesAdded} added, ${result.freeSpaceGb.toFixed(1)} GB free`
    );
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastCycleAt = new Date().toISOString();
    lastCycleError = message;
    console.error('[Rotation] Cycle failed:', message);
    const result = {
      ...emptyResult(targetFreeGb),
      skippedReason: `Cycle error: ${message}`,
    };
    writeRotationLog(result);
    return result;
  } finally {
    isCycleRunning = false;
  }
}

/**
 * Stop the in-memory cron task without touching persisted settings.
 */
export function stopRotationTask(): void {
  if (task) {
    void task.stop();
    task = null;
  }
  console.warn('[Rotation] Scheduler task stopped (settings preserved)');
}

/**
 * Returns a promise that resolves once any in-progress rotation cycle finishes.
 */
export function waitForCycleEnd(): Promise<void> {
  if (!isCycleRunning) return Promise.resolve();
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (!isCycleRunning) {
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });
}

/** Reset all scheduler state — for testing only. */
export function _resetRotationScheduler(): void {
  stopRotationScheduler();
  lastCycleAt = null;
  lastCycleError = null;
  isCycleRunning = false;
  cronExpression = DEFAULT_CRON;
}

/** Expose writeRotationLog for unit testing — for testing only. */
export const _writeRotationLogForTest = writeRotationLog;
