/**
 * In-process, env-gated scheduler for the AI alert evaluator
 * (see pillars/ai/docs/prds/ai-observability).
 *
 * A self-contained `setInterval` loop that calls `runEvaluation` directly
 * against the pillar's own AiDb handle every 5 minutes. It is OFF by default
 * and only starts when `AI_ALERTS_SCHEDULER_ENABLED=true`.
 */
import { type AiDb } from '../../../db/index.js';
import { logger } from '../../shared/logger.js';
import { runEvaluation } from './evaluator.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Default cadence: every 5 minutes. */
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
export function startAlertsScheduler(db: AiDb, opts: AlertsSchedulerOptions = {}): () => void {
  if (process.env['AI_ALERTS_SCHEDULER_ENABLED'] !== 'true') {
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

  logger.info({ intervalMs }, '[ai-alerts-scheduler] started (AI_ALERTS_SCHEDULER_ENABLED=true)');

  return () => {
    clearInterval(timer);
  };
}
