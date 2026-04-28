/**
 * Scheduled trigger — cron-based firing via BullMQ repeatable jobs
 * (PRD-089 US-04).
 *
 * Provides helpers for managing repeatable jobs: registering, removing,
 * and computing the next fire time for display.
 */
import { CronExpressionParser } from 'cron-parser';

import type { ReflexDefinition, ScheduleTriggerConfig } from '../types.js';

/**
 * Compute the next fire time for a scheduled reflex.
 * Returns an ISO 8601 string or null if the reflex is not a schedule trigger.
 */
export function getNextFireTime(reflex: ReflexDefinition, timezone?: string): string | null {
  if (reflex.trigger.type !== 'schedule') return null;
  const trigger = reflex.trigger as ScheduleTriggerConfig;

  try {
    const interval = CronExpressionParser.parse(trigger.cron, {
      tz: timezone,
    });
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
  // A valid 5-field cron must have exactly 5 space-separated fields.
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
