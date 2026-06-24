/**
 * In-process, env-gated schedulers for the AI observability summary and
 * inference-log retention jobs.
 *
 * A self-contained `setInterval` loop calls the idempotent `runSummary` /
 * `runRetention` service functions directly against the pillar's own DB
 * handle. It is OFF by default and only starts when
 * `AI_OBSERVABILITY_SCHEDULER_ENABLED=true`.
 *
 * The pillar has no durable job runner, so this fires on a relative
 * interval rather than cron at fixed UTC times (e.g. 03:00 summary, 04:00
 * retention); add cron scheduling once one exists.
 *
 * Spec: pillars/ai/docs/prds/ai-observability
 */
import { type AiDb } from '../../../db/index.js';
import { logger } from '../../shared/logger.js';
import { runRetention } from './retention.js';
import { runSummary } from './summary.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Default cadence: hourly. Both jobs are idempotent so a coarse interval
 * is safe — the summary refreshes the cached envelope and the retention
 * pass is a no-op when nothing has aged out. */
export const OBSERVABILITY_SCHEDULER_INTERVAL_MS = ONE_HOUR_MS;

export interface ObservabilitySchedulerOptions {
  /** Override the tick cadence (used by tests). */
  intervalMs?: number;
}

/**
 * Start the env-gated observability scheduler. Returns a stop function.
 * When the env gate is off, returns a no-op stop function and never
 * arms a timer.
 */
export function startObservabilityScheduler(
  db: AiDb,
  opts: ObservabilitySchedulerOptions = {}
): () => void {
  if (process.env['AI_OBSERVABILITY_SCHEDULER_ENABLED'] !== 'true') {
    return () => {};
  }

  const intervalMs = opts.intervalMs ?? OBSERVABILITY_SCHEDULER_INTERVAL_MS;

  const tick = (): void => {
    try {
      runSummary(db);
      runRetention(db);
    } catch (err) {
      logger.error({ err }, '[ai-observability-scheduler] tick failed');
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Don't keep the event loop alive on account of the scheduler.
  timer.unref();

  logger.info(
    { intervalMs },
    '[ai-observability-scheduler] started (AI_OBSERVABILITY_SCHEDULER_ENABLED=true)'
  );

  return () => {
    clearInterval(timer);
  };
}
