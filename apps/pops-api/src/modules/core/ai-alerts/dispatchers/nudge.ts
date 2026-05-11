/**
 * Cerebrum nudge dispatcher (PRD-092 US-07, PRD-084).
 *
 * Persists the alert as a nudge_log row using the existing nudge persistence
 * schema (no engram IDs — these nudges are observability events, not engram
 * recommendations). The nudge type is the fixed string `insight` since
 * PRD-084 reserves the four canonical detector types.
 *
 * The Cerebrum nudge surfaces query the nudge_log directly, so writing a row
 * here is enough to make the alert visible alongside other proactive
 * nudges.
 */
import { nudgeLog } from '@pops/db-types';

import { getDrizzle } from '../../../../db.js';
import { logger } from '../../../../lib/logger.js';

import type { FiredAlert } from '../types.js';

/** Map alert severity to nudge priority. */
function priorityFor(severity: FiredAlert['severity']): 'low' | 'medium' | 'high' {
  return severity === 'critical' ? 'high' : 'medium';
}

/** Build the nudge ID — mirrors `generateNudgeId` shape for consistency. */
function buildNudgeId(now: Date, alertId: number): string {
  const pad = (n: number, len: number): string => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  const time = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}`;
  return `nudge_${date}_${time}_aiAlert_${alertId}`;
}

export interface DispatchNudgeOptions {
  now?: () => Date;
}

/**
 * Dispatch the alert by writing a nudge_log row. Returns `true` when the
 * nudge was created. Throws on DB errors.
 */
export function dispatchNudge(alert: FiredAlert, options: DispatchNudgeOptions = {}): boolean {
  const now = options.now ?? (() => new Date());
  const db = getDrizzle();
  const id = buildNudgeId(now(), alert.id);
  const title = `AI alert: ${alert.type}`;
  const body = alert.scopeDetail ? `${alert.message} (${alert.scopeDetail})` : alert.message;

  db.insert(nudgeLog)
    .values({
      id,
      type: 'insight',
      title,
      body,
      engramIds: JSON.stringify([]),
      priority: priorityFor(alert.severity),
      status: 'pending',
      createdAt: now().toISOString(),
      expiresAt: null,
      actionType: null,
      actionLabel: null,
      actionParams: JSON.stringify({
        source: 'ai-alert',
        alertId: alert.id,
        ruleId: alert.ruleId,
        alertType: alert.type,
        severity: alert.severity,
      }),
    })
    .run();
  logger.debug({ nudgeId: id, alertId: alert.id }, '[ai-alerts/nudge] Nudge created');
  return true;
}
