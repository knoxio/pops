/**
 * BullMQ scheduler for the AI inference log retention job (PRD-092 US-08).
 *
 * Registers a repeatable job on the `pops-default` queue that runs nightly
 * at 04:00 UTC. The 04:00 slot was chosen to run after the 03:00 UTC
 * summary job (US-05) so we always aggregate over a complete dataset.
 *
 * The job is fully idempotent — see `runRetention` in ./retention.ts. If
 * Redis is unavailable, the queue getter returns `null` and we log a
 * warning instead of crashing — the API operates in degraded mode where
 * raw `ai_inference_log` rows are simply not pruned.
 */
import pino from 'pino';

import { DEFAULT_JOB_OPTIONS, getDefaultQueue } from '../../../jobs/queues.js';

import type { AiLogRetentionJobData } from '../../../jobs/types.js';

const logger = pino({ name: 'ai-retention-scheduler' });

export const AI_LOG_RETENTION_SCHEDULER_ID = 'pops-ai-log-retention';
export const AI_LOG_RETENTION_JOB_NAME = 'aiLogRetention';
/** Cron expression: 04:00 UTC every day. */
export const AI_LOG_RETENTION_CRON = '0 4 * * *';

/**
 * Register the daily retention scheduler. Safe to call multiple times —
 * BullMQ's `upsertJobScheduler` keys off the scheduler ID.
 *
 * Returns `true` on success, `false` when Redis is disabled (degraded mode).
 */
export async function registerAiLogRetentionScheduler(): Promise<boolean> {
  // The default queue getter always returns a Queue instance (it does not
  // probe Redis), but if `REDIS_HOST` is unset we treat the system as
  // degraded so we don't push errors during boot.
  if (!process.env['REDIS_HOST']) {
    logger.warn(
      'REDIS_HOST not set — AI inference log retention disabled (degraded mode). Raw rows will not be pruned.'
    );
    return false;
  }

  const queue = getDefaultQueue();
  if (!queue) {
    logger.warn(
      'Default queue unavailable — AI inference log retention disabled. Raw rows will not be pruned.'
    );
    return false;
  }

  const data: AiLogRetentionJobData = { type: 'aiLogRetention' };

  try {
    await queue.upsertJobScheduler(
      AI_LOG_RETENTION_SCHEDULER_ID,
      { pattern: AI_LOG_RETENTION_CRON, tz: 'UTC' },
      { name: AI_LOG_RETENTION_JOB_NAME, data, opts: DEFAULT_JOB_OPTIONS }
    );
    logger.info(
      { schedulerId: AI_LOG_RETENTION_SCHEDULER_ID, cron: AI_LOG_RETENTION_CRON },
      'AI log retention scheduler registered'
    );
    return true;
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to register AI log retention scheduler');
    return false;
  }
}

/** Deregister the scheduler — used during graceful shutdown. */
export async function unregisterAiLogRetentionScheduler(): Promise<void> {
  if (!process.env['REDIS_HOST']) return;
  const queue = getDefaultQueue();
  if (!queue) return;
  try {
    await queue.removeJobScheduler(AI_LOG_RETENTION_SCHEDULER_ID);
  } catch (err: unknown) {
    logger.error({ err }, 'Failed to deregister AI log retention scheduler');
  }
}
