/**
 * Rotation scheduler — daily cron job orchestrating the full rotation cycle.
 *
 * Follows the Plex scheduler singleton pattern: module-level state,
 * settings-driven, auto-resume on startup.
 *
 * PRD-070 US-06
 */
import cron, { type ScheduledTask } from 'node-cron';
import { CronExpressionParser } from 'cron-parser';
import { eq } from 'drizzle-orm';
import { settings, rotationLog } from '@pops/db-types';
import { getDrizzle } from '../../../db.js';
import {
  getRadarrDiskSpace,
  getRadarrMovieSizes,
  calculateRemovalDeficit,
  getEligibleForRemoval,
  getDownloadingTmdbIds,
  selectMoviesForRemoval,
  markMoviesAsLeaving,
  getLeavingMovieSizeGb,
  processExpiredMovies,
} from './removal-selection.js';
import {
  getAdditionBudget,
  addMoviesFromQueue,
  getDailyAdditions,
  getAvgMovieGb,
} from './addition-gating.js';

// ---------------------------------------------------------------------------
// Settings keys
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = {
  enabled: 'rotation_enabled',
  cronExpression: 'rotation_cron_expression',
  targetFreeGb: 'rotation_target_free_gb',
  leavingDays: 'rotation_leaving_days',
} as const;

const DEFAULT_CRON = '0 3 * * *'; // 3 AM daily
const DEFAULT_TARGET_FREE_GB = 100;
const DEFAULT_LEAVING_DAYS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RotationSchedulerStatus {
  isRunning: boolean;
  isCycleRunning: boolean;
  cronExpression: string;
  lastCycleAt: string | null;
  lastCycleError: string | null;
  nextRunAt: string | null;
}

export interface RotationCycleResult {
  moviesMarkedLeaving: number;
  moviesRemoved: number;
  moviesAdded: number;
  removalsFailed: number;
  freeSpaceGb: number;
  targetFreeGb: number;
  skippedReason: string | null;
}

// ---------------------------------------------------------------------------
// Module singleton state
// ---------------------------------------------------------------------------

let task: ScheduledTask | null = null;
let cronExpression = DEFAULT_CRON;
let isCycleRunning = false;
let lastCycleAt: string | null = null;
let lastCycleError: string | null = null;

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start the rotation scheduler. No-op if already running. */
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

  console.log(`[Rotation] Scheduler started (cron: ${cronExpression})`);
  return getRotationSchedulerStatus();
}

/** Stop the rotation scheduler. No-op if not running. */
export function stopRotationScheduler(): RotationSchedulerStatus {
  if (task) {
    void task.stop();
    task = null;
  }

  deleteSetting(SETTINGS_KEYS.enabled);
  deleteSetting(SETTINGS_KEYS.cronExpression);

  console.log('[Rotation] Scheduler stopped');
  return getRotationSchedulerStatus();
}

/** Get current scheduler status. */
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

/** Auto-resume the scheduler on server startup if previously enabled. */
export function resumeRotationSchedulerIfEnabled(): RotationSchedulerStatus | null {
  const enabled = getSetting(SETTINGS_KEYS.enabled);
  if (enabled !== 'true') return null;

  const savedCron = getSetting(SETTINGS_KEYS.cronExpression) ?? DEFAULT_CRON;
  console.log(`[Rotation] Auto-resuming scheduler (cron: ${savedCron})`);
  return startRotationScheduler({ cronExpression: savedCron });
}

/** Trigger an immediate rotation cycle. Returns null if a cycle is already running. */
export async function runRotationCycleNow(): Promise<RotationCycleResult | null> {
  if (isCycleRunning) {
    console.log('[Rotation] Cycle already in progress — skipping');
    return null;
  }
  return runRotationCycle();
}

// ---------------------------------------------------------------------------
// Core rotation cycle
// ---------------------------------------------------------------------------

export async function runRotationCycle(): Promise<RotationCycleResult> {
  if (isCycleRunning) {
    const result: RotationCycleResult = {
      moviesMarkedLeaving: 0,
      moviesRemoved: 0,
      moviesAdded: 0,
      removalsFailed: 0,
      freeSpaceGb: 0,
      targetFreeGb: getTargetFreeGb(),
      skippedReason: 'Concurrent cycle already running',
    };
    writeRotationLog(result);
    return result;
  }

  isCycleRunning = true;
  const targetFreeGb = getTargetFreeGb();
  const leavingDays = getLeavingDays();

  try {
    // Step 1: Process expired leaving movies (Radarr delete)
    const expiredResults = await processExpiredMovies();
    const moviesRemoved = expiredResults.filter((r) => r.success).length;
    const removalsFailed = expiredResults.filter((r) => !r.success).length;

    // Step 2: Measure free space
    let freeSpaceGb: number;
    try {
      freeSpaceGb = await getRadarrDiskSpace();
    } catch {
      const result: RotationCycleResult = {
        moviesMarkedLeaving: 0,
        moviesRemoved,
        moviesAdded: 0,
        removalsFailed,
        freeSpaceGb: 0,
        targetFreeGb,
        skippedReason: 'Radarr unavailable — cannot measure disk space',
      };
      writeRotationLog(result);
      lastCycleAt = new Date().toISOString();
      lastCycleError = result.skippedReason;
      return result;
    }

    // Step 3: Calculate deficit and select movies for removal
    const movieSizes = await getRadarrMovieSizes();
    const leavingSizeGb = getLeavingMovieSizeGb(movieSizes);
    const deficit = calculateRemovalDeficit(targetFreeGb, freeSpaceGb, leavingSizeGb);

    let moviesMarkedLeaving = 0;
    if (deficit > 0) {
      const downloadingIds = await getDownloadingTmdbIds();
      const eligible = getEligibleForRemoval(movieSizes, downloadingIds);
      const selection = selectMoviesForRemoval(eligible, movieSizes, deficit);

      if (selection.moviesToMark.length > 0) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + leavingDays);
        markMoviesAsLeaving(
          selection.moviesToMark.map((m) => m.id),
          expiresAt.toISOString()
        );
        moviesMarkedLeaving = selection.moviesToMark.length;
      }
    }

    // Step 4: Re-check free space and add movies from candidate queue
    let postFreeSpaceGb: number;
    try {
      postFreeSpaceGb = await getRadarrDiskSpace();
    } catch {
      postFreeSpaceGb = freeSpaceGb; // fall back to earlier measurement
    }

    const budget = getAdditionBudget(
      postFreeSpaceGb,
      targetFreeGb,
      getAvgMovieGb(),
      getDailyAdditions()
    );
    const additionResult = await addMoviesFromQueue(budget);
    const moviesAdded = additionResult.added;

    if (budget === 0) {
      console.log('[Rotation] Additions skipped — below target free space');
    }

    const result: RotationCycleResult = {
      moviesMarkedLeaving,
      moviesRemoved,
      moviesAdded,
      removalsFailed,
      freeSpaceGb,
      targetFreeGb,
      skippedReason: null,
    };

    writeRotationLog(result);
    lastCycleAt = new Date().toISOString();
    lastCycleError = null;

    console.log(
      `[Rotation] Cycle complete: ${moviesRemoved} removed, ${moviesMarkedLeaving} marked leaving, ${moviesAdded} added, ${freeSpaceGb.toFixed(1)} GB free`
    );

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    lastCycleAt = new Date().toISOString();
    lastCycleError = message;
    console.error('[Rotation] Cycle failed:', message);

    const result: RotationCycleResult = {
      moviesMarkedLeaving: 0,
      moviesRemoved: 0,
      moviesAdded: 0,
      removalsFailed: 0,
      freeSpaceGb: 0,
      targetFreeGb,
      skippedReason: `Cycle error: ${message}`,
    };
    writeRotationLog(result);
    return result;
  } finally {
    isCycleRunning = false;
  }
}

// ---------------------------------------------------------------------------
// Rotation log
// ---------------------------------------------------------------------------

function writeRotationLog(result: RotationCycleResult): void {
  const db = getDrizzle();
  db.insert(rotationLog)
    .values({
      executedAt: new Date().toISOString(),
      moviesMarkedLeaving: result.moviesMarkedLeaving,
      moviesRemoved: result.moviesRemoved,
      moviesAdded: result.moviesAdded,
      removalsFailed: result.removalsFailed,
      freeSpaceGb: result.freeSpaceGb,
      targetFreeGb: result.targetFreeGb,
      skippedReason: result.skippedReason,
      details: null,
    })
    .run();
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Reset all scheduler state — for testing only. */
export function _resetRotationScheduler(): void {
  stopRotationScheduler();
  lastCycleAt = null;
  lastCycleError = null;
  isCycleRunning = false;
  cronExpression = DEFAULT_CRON;
}
