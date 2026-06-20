/**
 * In-process, env-gated schedulers for the AI observability summary
 * (PRD-092 US-05) and inference-log retention (PRD-092 US-08) jobs.
 *
 * The monolith registers these as repeatable BullMQ jobs on the
 * `pops-default` queue (see
 * `apps/pops-api/src/modules/core/ai-observability/{summary-,}scheduler.ts`).
 * The core pillar container has no BullMQ worker or Redis dependency, so
 * porting the queue registration as-is would drag Redis/BullMQ across the
 * pillar boundary — not an additive change.
 *
 * Instead this provides a self-contained `setInterval` loop that calls the
 * idempotent `runSummary` / `runRetention` service functions directly
 * against the pillar's own core.db handle. It is OFF by default and only
 * starts when `CORE_AI_OBSERVABILITY_SCHEDULER_ENABLED=true`, mirroring the
 * boot-time registration in the monolith but env-gated.
 *
 * TODO(core-pillar runbook — "ai-observability-summary / ai-log-retention
 * scheduler"): once the pillar has a durable job runner, replace this
 * interval loop with proper cron-scheduled jobs (03:00 UTC summary, 04:00
 * UTC retention) so timing matches the monolith rather than relative
 * intervals.
 */
import { type CoreDb } from '../../../db/index.js';
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
  db: CoreDb,
  opts: ObservabilitySchedulerOptions = {}
): () => void {
  if (process.env['CORE_AI_OBSERVABILITY_SCHEDULER_ENABLED'] !== 'true') {
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
    '[ai-observability-scheduler] started (CORE_AI_OBSERVABILITY_SCHEDULER_ENABLED=true)'
  );

  return () => {
    clearInterval(timer);
  };
}
