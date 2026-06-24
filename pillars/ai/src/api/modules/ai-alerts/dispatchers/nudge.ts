/**
 * Cerebrum nudge dispatcher.
 *
 * Surfaces the alert as a cerebrum nudge by calling the cerebrum REST SDK
 * (`pillar('cerebrum').nudges.create`, which maps to `POST /nudges` — the
 * alert-driven single insert, no dedup). The nudge type is the fixed string
 * `insight` because the canonical detector types are reserved for engram
 * recommendations; these nudges are observability events (hence no engram IDs).
 *
 * Best-effort / fire-and-forget: cerebrum being unavailable (a non-`ok`
 * `CallResult`) is logged and swallowed so an alert dispatch never throws.
 * The cerebrum caller is injectable so tests stub it without a network.
 */
import { isOk, pillar, type CallResult } from '@pops/pillar-sdk/client';

import { logger } from '../../../shared/logger.js';

import type { FiredAlert } from '../types.js';

/** The cerebrum `nudges.create` request body (see `pillars/cerebrum/src/contract/rest-nudges.ts`). */
export interface CerebrumNudgeCreateBody {
  type?: 'consolidation' | 'staleness' | 'pattern' | 'insight';
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  engramIds?: string[];
  expiresAt?: string | null;
  action?: {
    type: 'consolidate' | 'archive' | 'review' | 'link';
    label: string;
    params: Record<string, unknown>;
  } | null;
}

/**
 * Injectable cerebrum nudge sink. Mirrors the SDK's projected
 * `nudges.create` signature: returns a `CallResult` rather than throwing so
 * the dispatcher can treat unavailability as best-effort.
 */
export type NudgeSink = (body: CerebrumNudgeCreateBody) => Promise<CallResult<unknown>>;

/** Default sink — the live cerebrum REST SDK proxy. */
type CerebrumNudgesHandle = {
  nudges: { create: NudgeSink };
};

function defaultNudgeSink(): NudgeSink {
  return (body) => pillar<CerebrumNudgesHandle>('cerebrum').nudges.create(body);
}

/** Map alert severity to nudge priority. */
function priorityFor(severity: FiredAlert['severity']): 'low' | 'medium' | 'high' {
  return severity === 'critical' ? 'high' : 'medium';
}

export interface DispatchNudgeOptions {
  /** Injectable cerebrum nudge sink. Defaults to the live REST SDK proxy. */
  sink?: NudgeSink;
}

/**
 * Build the cerebrum `nudges.create` body for a fired alert.
 *
 * Alert provenance (ids, rule, type, severity) rides on `action.params` so the
 * cerebrum nudge surface can trace each nudge back to its originating alert.
 */
export function buildNudgeBody(alert: FiredAlert): CerebrumNudgeCreateBody {
  const body = alert.scopeDetail ? `${alert.message} (${alert.scopeDetail})` : alert.message;
  return {
    type: 'insight',
    title: `AI alert: ${alert.type}`,
    body,
    priority: priorityFor(alert.severity),
    engramIds: [],
    expiresAt: null,
    action: {
      type: 'review',
      label: 'Review alert',
      params: {
        source: 'ai-alert',
        alertId: alert.id,
        ruleId: alert.ruleId,
        alertType: alert.type,
        severity: alert.severity,
      },
    },
  };
}

/**
 * Dispatch the alert by creating a cerebrum nudge over the REST SDK.
 *
 * Best-effort: returns `true` only when cerebrum acknowledged the write
 * (`CallResult.kind === 'ok'`). A non-`ok` result (cerebrum unavailable /
 * degraded) is logged and returns `false` — it never throws, so an alert
 * dispatch is not blocked by cerebrum being down.
 */
export async function dispatchNudge(
  alert: FiredAlert,
  options: DispatchNudgeOptions = {}
): Promise<boolean> {
  const sink = options.sink ?? defaultNudgeSink();
  const result = await sink(buildNudgeBody(alert));
  if (isOk(result)) {
    logger.debug({ alertId: alert.id }, '[ai-alerts/nudge] Nudge created');
    return true;
  }
  logger.warn(
    { alertId: alert.id, kind: result.kind },
    '[ai-alerts/nudge] Cerebrum nudge create failed; swallowing'
  );
  return false;
}
