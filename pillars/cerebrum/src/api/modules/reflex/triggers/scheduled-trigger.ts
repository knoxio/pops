/**
 * Scheduled trigger — cron-based firing via BullMQ repeatable jobs
 * (PRD-089 US-04).
 *
 * Provides helpers for managing repeatable jobs: registering, removing,
 * and computing the next fire time for display. The pillar reflex surface
 * only needs the pure cron + job-name helpers; the live queue lives outside
 * the request path.
 */
import { CronExpressionParser } from 'cron-parser';

import type { ReflexDefinition, ScheduleTriggerConfig } from '../types.js';

/**
 * Compute the next fire time for a scheduled reflex.
 * Returns an ISO 8601 string or null if the reflex is not a schedule trigger.
 */
export function getNextFireTime(reflex: ReflexDefinition, timezone?: string): string | null {
  if (reflex.trigger.type !== 'schedule') return null;
  const trigger: ScheduleTriggerConfig = reflex.trigger;

  try {
    const interval = CronExpressionParser.parse(trigger.cron, { tz: timezone });
    return interval.next().toISOString();
  } catch {
    return null;
  }
}

/**
 * Validate that a cron expression is a valid 5-field expression.
 * Returns true if valid, false otherwise.
 */
export function isValidCron(cron: string): boolean {
  if (!cron.trim()) return false;
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  try {
    CronExpressionParser.parse(cron);
    return true;
  } catch {
    return false;
  }
}

/** Job name for a scheduled reflex's BullMQ repeatable job. */
export function scheduledJobName(reflexName: string): string {
  return `reflex:scheduled:${reflexName}`;
}

/**
 * Generate a unique repeatable job key for deduplication.
 * BullMQ uses jobId + cron pattern for repeatable job dedup.
 */
export function scheduledJobId(reflexName: string): string {
  return `reflex-sched-${reflexName}`;
}
