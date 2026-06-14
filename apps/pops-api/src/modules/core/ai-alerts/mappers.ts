import { ALERT_RULE_TYPES, ALERT_SEVERITIES } from './types.js';

/**
 * Row ↔ domain mappers for AI alert rules and alerts.
 *
 * Centralises the integer ↔ boolean and enum widening so callers never
 * need to repeat those conversions.
 */
import type { AiAlertRow, AiAlertRuleRow } from '@pops/db-types';

import type { AlertRule, AlertRuleType, AlertSeverity, FiredAlert } from './types.js';

function toAlertRuleType(value: string): AlertRuleType {
  if ((ALERT_RULE_TYPES as readonly string[]).includes(value)) {
    return value as AlertRuleType;
  }
  throw new Error(`Unknown AI alert rule type: ${value}`);
}

function toAlertSeverity(value: string): AlertSeverity {
  if ((ALERT_SEVERITIES as readonly string[]).includes(value)) {
    return value as AlertSeverity;
  }
  throw new Error(`Unknown AI alert severity: ${value}`);
}

export function ruleRowToRule(row: AiAlertRuleRow): AlertRule {
  return {
    id: row.id,
    type: toAlertRuleType(row.type),
    scopeProvider: row.scopeProvider,
    scopeModel: row.scopeModel,
    thresholdValue: row.thresholdValue,
    windowMinutes: row.windowMinutes,
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function alertRowToAlert(row: AiAlertRow): FiredAlert {
  return {
    id: row.id,
    ruleId: row.ruleId,
    type: toAlertRuleType(row.type),
    message: row.message,
    severity: toAlertSeverity(row.severity),
    scopeDetail: row.scopeDetail,
    metricValue: row.metricValue,
    thresholdValue: row.thresholdValue,
    acknowledged: row.acknowledged === 1,
    acknowledgedAt: row.acknowledgedAt,
    createdAt: row.createdAt,
  };
}
