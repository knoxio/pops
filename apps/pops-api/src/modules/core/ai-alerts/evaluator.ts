/**
 * Alert rule evaluator orchestrator (PRD-092 US-07).
 *
 * Loads enabled rules, delegates to per-type evaluator functions, dedupes,
 * persists, and dispatches via channel handlers. The actual evaluation
 * logic lives in `./evaluators/*` to keep each file within the project
 * max-lines lint budget and to make each rule type independently testable.
 *
 * The orchestrator is invoked from the BullMQ scheduled worker every 5
 * minutes — see `scheduler.ts`. Tests drive `runEvaluation` directly
 * against a seeded DB.
 *
 * Reads + writes resolve against `getCoreDrizzle()` now that PRD-186 PR 4
 * lands `ai_alerts` + `ai_alert_rules` in `@pops/core-db`. The per-rule
 * evaluator helpers (`evaluators/*`) still receive the same drizzle
 * handle for ergonomics — the orchestrator owns the handle resolution.
 */
import { eq } from 'drizzle-orm';

import { aiAlertRules } from '@pops/core-db';

import { getCoreDrizzle } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import { insertAlertIfNotDuplicate } from './alerts-store.js';
import { dispatchAlert } from './dispatch.js';
import { evaluateBudgetThreshold } from './evaluators/budget.js';
import { evaluateErrorSpike } from './evaluators/error-spike.js';
import { evaluateLatencyDegradation } from './evaluators/latency.js';
import { ruleRowToRule } from './mappers.js';

import type { AlertCandidate, AlertRule, DispatchedAlert, FiredAlert } from './types.js';

export { DEDUP_WINDOW_MINUTES, acknowledgeAlert, listAlerts } from './alerts-store.js';
export type { ListAlertsFilters } from './alerts-store.js';

interface EvaluatorDeps {
  db: ReturnType<typeof getCoreDrizzle>;
  now: Date;
}

export interface RunEvaluationOptions {
  /** Override "now" for deterministic tests. */
  now?: Date;
  /** Skip channel dispatch (used in tests that only assert on rows). */
  dispatch?: boolean;
}

export interface RunEvaluationResult {
  rulesEvaluated: number;
  candidates: number;
  deduped: number;
  alerts: DispatchedAlert[];
}

/** Evaluate a single rule against the current state. Exported for tests. */
export function evaluateRule(rule: AlertRule, deps: EvaluatorDeps): AlertCandidate[] {
  switch (rule.type) {
    case 'budget-threshold':
      return evaluateBudgetThreshold(rule, deps.db, deps.now);
    case 'error-spike':
      return evaluateErrorSpike(rule, deps.db, deps.now);
    case 'latency-degradation':
      return evaluateLatencyDegradation(rule, deps.db, deps.now);
  }
}

/** List enabled rules from the DB. */
export function loadEnabledRules(db: ReturnType<typeof getCoreDrizzle>): AlertRule[] {
  return db.select().from(aiAlertRules).where(eq(aiAlertRules.enabled, 1)).all().map(ruleRowToRule);
}

async function dispatchPersistedAlert(
  alert: FiredAlert,
  dispatchEnabled: boolean
): Promise<DispatchedAlert> {
  if (!dispatchEnabled) return { ...alert, channels: [] };
  const results = await dispatchAlert(alert);
  const channels = results.filter((r) => r.delivered).map((r) => r.channel);
  return { ...alert, channels };
}

/**
 * Run the full evaluation cycle: load rules → evaluate → dedupe → persist →
 * dispatch. Returns counters + the alerts that fired this cycle.
 */
export async function runEvaluation(
  options: RunEvaluationOptions = {}
): Promise<RunEvaluationResult> {
  const db = getCoreDrizzle();
  const now = options.now ?? new Date();
  const dispatchEnabled = options.dispatch ?? true;
  const rules = loadEnabledRules(db);

  let totalCandidates = 0;
  let dedupedCount = 0;
  const fired: DispatchedAlert[] = [];

  for (const rule of rules) {
    const candidates = evaluateRule(rule, { db, now });
    totalCandidates += candidates.length;
    for (const candidate of candidates) {
      const persisted = insertAlertIfNotDuplicate(db, candidate, now);
      if (!persisted) {
        dedupedCount += 1;
        continue;
      }
      fired.push(await dispatchPersistedAlert(persisted, dispatchEnabled));
    }
  }
  logger.info(
    {
      rulesEvaluated: rules.length,
      candidates: totalCandidates,
      deduped: dedupedCount,
      fired: fired.length,
    },
    '[ai-alerts] Evaluation cycle complete'
  );
  return {
    rulesEvaluated: rules.length,
    candidates: totalCandidates,
    deduped: dedupedCount,
    alerts: fired,
  };
}
