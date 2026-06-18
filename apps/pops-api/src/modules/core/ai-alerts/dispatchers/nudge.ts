/**
 * Cerebrum nudge dispatcher (PRD-092 US-07, PRD-084).
 *
 * Surfaces the alert as a nudge by POSTing to the cerebrum pillar's
 * `POST /nudges` endpoint (the pillar owns `nudge_log` now). The nudge type is
 * the fixed string `insight` since PRD-084 reserves the four canonical
 * detector types; these nudges are observability events, not engram
 * recommendations, so `engramIds` is empty.
 *
 * The cerebrum surfaces query `nudge_log` directly, so creating a row there is
 * enough to make the alert visible alongside other proactive nudges. If the
 * cerebrum pillar is absent from `POPS_PILLARS` (e.g. a dev box) or the POST
 * fails, the dispatcher fails soft — logs and returns `false` — so a cerebrum
 * outage never crashes the alert pipeline.
 */
import { logger } from '../../../../lib/logger.js';
import { createCerebrumNudgeClient, type CerebrumNudgeClient } from './cerebrum-nudge-client.js';

import type { FiredAlert } from '../types.js';

/** Map alert severity to nudge priority. */
function priorityFor(severity: FiredAlert['severity']): 'low' | 'medium' | 'high' {
  return severity === 'critical' ? 'high' : 'medium';
}

export interface DispatchNudgeOptions {
  /**
   * Override the cerebrum nudge client (for tests). When omitted the default
   * client is built from `POPS_PILLARS`; if cerebrum is not registered the
   * dispatch no-ops and returns `false`.
   */
  nudgeClient?: CerebrumNudgeClient | null;
}

/**
 * Dispatch the alert by creating a nudge over the cerebrum REST API. Returns
 * `true` when the nudge was created, `false` when cerebrum is unavailable or
 * the create failed (the failure is logged, never thrown, so `dispatchAlert`
 * records a non-delivery rather than aborting the channel loop).
 */
export async function dispatchNudge(
  alert: FiredAlert,
  options: DispatchNudgeOptions = {}
): Promise<boolean> {
  const client =
    options.nudgeClient === undefined ? createCerebrumNudgeClient() : options.nudgeClient;
  if (!client) {
    logger.debug(
      { alertId: alert.id },
      '[ai-alerts/nudge] Cerebrum pillar not configured — skipping nudge dispatch'
    );
    return false;
  }

  const title = `AI alert: ${alert.type}`;
  const body = alert.scopeDetail ? `${alert.message} (${alert.scopeDetail})` : alert.message;

  try {
    const nudge = await client.createNudge({
      type: 'insight',
      title,
      body,
      priority: priorityFor(alert.severity),
      engramIds: [],
    });
    logger.debug({ nudgeId: nudge.id, alertId: alert.id }, '[ai-alerts/nudge] Nudge created');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { alertId: alert.id, error: message },
      '[ai-alerts/nudge] Failed to create nudge via cerebrum'
    );
    return false;
  }
}
