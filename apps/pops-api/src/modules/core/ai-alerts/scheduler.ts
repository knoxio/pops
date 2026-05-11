/**
 * BullMQ scheduler for the AI alert evaluator job (PRD-092 US-07).
 *
 * Registers a repeatable job on the `pops-default` queue that runs every 5
 * minutes. Mirrors the retention scheduler pattern (`ai-observability/scheduler.ts`).
 *
 * When `REDIS_HOST` is unset or BullMQ is unavailable the scheduler logs a
 * warning and operates in degraded mode (no scheduled evaluations).
 */
import pino from 'pino';

import { DEFAULT_JOB_OPTIONS, getDefaultQueue } from '../../../jobs/queues.js';

import type { AiAlertEvaluationJobData } from '../../../jobs/types.js';

const logger = pino({ name: 'ai-alerts-scheduler' });

export const AI_ALERTS_SCHEDULER_ID = 'pops-ai-alerts';
export const AI_ALERTS_JOB_NAME = 'aiAlertEvaluation';
/** Cron expression: every 5 minutes. */
export const AI_ALERTS_CRON = '*/5 * * * *';

/**
 * Register the 5-minute evaluator scheduler. Safe to call multiple times —
 * BullMQ keys off the scheduler ID. Returns `true` on success, `false` when
 * Redis is unavailable.
 */
export async function registerAiAlertsScheduler(): Promise<boolean> {
  if (!process.env['REDIS_HOST']) {
    logger.warn('REDIS_HOST not set — AI alert evaluation disabled (degraded mode).');
    return false;
  }
  const queue = getDefaultQueue();
  if (!queue) {
    logger.warn('Default queue unavailable — AI alert evaluation disabled.');
    return false;
  }
  const data: AiAlertEvaluationJobData = { type: 'aiAlertEvaluation' };
  try {
    await queue.upsertJobScheduler(
      AI_ALERTS_SCHEDULER_ID,
      { pattern: AI_ALERTS_CRON, tz: 'UTC' },
      { name: AI_ALERTS_JOB_NAME, data, opts: DEFAULT_JOB_OPTIONS }
    );
    logger.info(
      { schedulerId: AI_ALERTS_SCHEDULER_ID, cron: AI_ALERTS_CRON },
      'AI alert evaluator scheduler registered'
    );
    return true;
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to register AI alert evaluator scheduler');
    return false;
  }
}

/** Deregister — used during graceful shutdown. */
export async function unregisterAiAlertsScheduler(): Promise<void> {
  if (!process.env['REDIS_HOST']) return;
  const queue = getDefaultQueue();
  if (!queue) return;
  try {
    await queue.removeJobScheduler(AI_ALERTS_SCHEDULER_ID);
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to deregister AI alert evaluator scheduler');
  }
}
