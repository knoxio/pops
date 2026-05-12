/**
 * BullMQ scheduler for the daily AI observability summary job (PRD-092 US-05).
 *
 * Registers a repeatable job on the `pops-default` queue that runs nightly
 * at 03:00 UTC. The 03:00 slot intentionally runs before the 04:00 retention
 * job so the summary always sees a complete dataset for the rolling window.
 *
 * When `REDIS_HOST` is unset the queue getter returns `null` and we log a
 * warning instead of crashing — the API operates in degraded mode (the
 * cached settings row is simply not refreshed and the dashboard falls back
 * to live aggregation).
 */
import pino from 'pino';

import { DEFAULT_JOB_OPTIONS, getDefaultQueue } from '../../../jobs/queues.js';

import type { AiObservabilitySummaryJobData } from '../../../jobs/types.js';

const logger = pino({ name: 'ai-observability-summary-scheduler' });

export const AI_OBSERVABILITY_SUMMARY_SCHEDULER_ID = 'pops-ai-observability-summary';
export const AI_OBSERVABILITY_SUMMARY_JOB_NAME = 'aiObservabilitySummary';
/** Cron expression: 03:00 UTC every day. */
export const AI_OBSERVABILITY_SUMMARY_CRON = '0 3 * * *';

/**
 * Register the daily summary scheduler. Safe to call multiple times —
 * BullMQ's `upsertJobScheduler` keys off the scheduler ID.
 *
 * Returns `true` on success, `false` when Redis is disabled (degraded mode).
 */
export async function registerAiObservabilitySummaryScheduler(): Promise<boolean> {
  if (!process.env['REDIS_HOST']) {
    logger.warn(
      'REDIS_HOST not set — AI observability summary disabled (degraded mode). Settings cache will not be refreshed.'
    );
    return false;
  }

  const queue = getDefaultQueue();
  if (!queue) {
    logger.warn(
      'Default queue unavailable — AI observability summary disabled. Settings cache will not be refreshed.'
    );
    return false;
  }

  const data: AiObservabilitySummaryJobData = { type: 'aiObservabilitySummary' };

  try {
    await queue.upsertJobScheduler(
      AI_OBSERVABILITY_SUMMARY_SCHEDULER_ID,
      { pattern: AI_OBSERVABILITY_SUMMARY_CRON, tz: 'UTC' },
      { name: AI_OBSERVABILITY_SUMMARY_JOB_NAME, data, opts: DEFAULT_JOB_OPTIONS }
    );
    logger.info(
      {
        schedulerId: AI_OBSERVABILITY_SUMMARY_SCHEDULER_ID,
        cron: AI_OBSERVABILITY_SUMMARY_CRON,
      },
      'AI observability summary scheduler registered'
    );
    return true;
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to register AI observability summary scheduler');
    return false;
  }
}

/** Deregister the scheduler — used during graceful shutdown. */
export async function unregisterAiObservabilitySummaryScheduler(): Promise<void> {
  if (!process.env['REDIS_HOST']) return;
  const queue = getDefaultQueue();
  if (!queue) return;
  try {
    await queue.removeJobScheduler(AI_OBSERVABILITY_SUMMARY_SCHEDULER_ID);
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to deregister AI observability summary scheduler');
  }
}
