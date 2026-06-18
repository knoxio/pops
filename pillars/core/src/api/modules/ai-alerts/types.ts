/**
 * Public types for the AI alert subsystem (PRD-092 US-07).
 *
 * Rule type strings map 1:1 to evaluator implementations under `evaluators/`;
 * adding a new rule type requires both an entry here and a matching evaluator
 * registered in `evaluator.ts`.
 */

export const ALERT_RULE_TYPES = ['budget-threshold', 'error-spike', 'latency-degradation'] as const;

export type AlertRuleType = (typeof ALERT_RULE_TYPES)[number];

export const ALERT_CHANNELS = ['telegram', 'nudge'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export const ALERT_SEVERITIES = ['warning', 'critical'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface AlertRule {
  id: number;
  type: AlertRuleType;
  scopeProvider: string | null;
  scopeModel: string | null;
  thresholdValue: number;
  windowMinutes: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FiredAlert {
  id: number;
  ruleId: number | null;
  type: AlertRuleType;
  message: string;
  severity: AlertSeverity;
  scopeDetail: string | null;
  metricValue: number;
  thresholdValue: number;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

/**
 * Pre-persist trigger shape. A single rule can produce multiple candidates —
 * e.g. an unscoped latency rule fans out to one candidate per breaching model
 * — which is why the evaluator returns an array rather than a single value.
 */
export interface AlertCandidate {
  ruleId: number;
  type: AlertRuleType;
  severity: AlertSeverity;
  message: string;
  scopeDetail: string | null;
  metricValue: number;
  thresholdValue: number;
}

export interface DispatchedAlert extends FiredAlert {
  channels: AlertChannel[];
}
