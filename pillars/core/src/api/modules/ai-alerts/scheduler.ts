/**
 * In-process, env-gated scheduler for the AI alert evaluator (PRD-092 US-07).
 *
 * The monolith registers this as a repeatable BullMQ job on the
 * `pops-default` queue every 5 minutes (see
 * `apps/pops-api/src/modules/core/ai-alerts/scheduler.ts`). The core pillar
 * has no BullMQ worker or Redis dependency, so this provides a self-contained
 * `setInterval` loop that calls `runEvaluation` directly against the pillar's
 * own core.db handle. It is OFF by default and only starts when
 * `CORE_AI_ALERTS_SCHEDULER_ENABLED=true`.
 *
 * TODO(core-pillar runbook — "ai-alerts scheduler"): once the pillar has a
 * durable job runner, replace this interval loop with a proper cron-scheduled
 * job (every 5 minutes) so timing matches the monolith.
 */
import { type CoreDb } from '../../../db/index.js';
import { logger } from '../../shared/logger.js';
import { runEvaluation } from './evaluator.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Default cadence: every 5 minutes (mirrors the monolith cron). */
export const AI_ALERTS_SCHEDULER_INTERVAL_MS = FIVE_MINUTES_MS;

export interface AlertsSchedulerOptions {
  /** Override the tick cadence (used by tests). */
  intervalMs?: number;
}

/**
 * Start the env-gated alert evaluator scheduler. Returns a stop function.
 * When the env gate is off, returns a no-op stop function and never arms a
 * timer.
 */
export function startAlertsScheduler(db: CoreDb, opts: AlertsSchedulerOptions = {}): () => void {
  if (process.env['CORE_AI_ALERTS_SCHEDULER_ENABLED'] !== 'true') {
    return () => {};
  }

  const intervalMs = opts.intervalMs ?? AI_ALERTS_SCHEDULER_INTERVAL_MS;

  const tick = (): void => {
    void runEvaluation(db).catch((err: unknown) => {
      logger.error({ err }, '[ai-alerts-scheduler] evaluation tick failed');
    });
  };

  const timer = setInterval(tick, intervalMs);
  // Don't keep the event loop alive on account of the scheduler.
  timer.unref();

  logger.info(
    { intervalMs },
    '[ai-alerts-scheduler] started (CORE_AI_ALERTS_SCHEDULER_ENABLED=true)'
  );

  return () => {
    clearInterval(timer);
  };
}
