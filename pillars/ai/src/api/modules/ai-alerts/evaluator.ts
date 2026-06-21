/**
 * Alert rule evaluator orchestrator (PRD-092 US-07).
 *
 * Loads enabled rules, delegates to per-type evaluator functions, dedupes,
 * persists, and dispatches via channel handlers. The actual evaluation
 * logic lives in `./evaluators/*` to keep each file within the project
 * max-lines lint budget and to make each rule type independently testable.
 *
 * In the monolith the orchestrator is invoked from the BullMQ scheduled
 * worker every 5 minutes. In the core pillar it is exposed via the
 * `core.aiAlerts.runNow` mutation and (optionally) the env-gated in-process
 * scheduler — see `./scheduler.ts`.
 *
 * Reads + writes resolve against the request-scoped core drizzle handle
 * threaded in by the caller; the per-rule evaluator helpers receive the same
 * handle for ergonomics.
 */
import { eq } from 'drizzle-orm';

import { aiAlertRules, type AiDb } from '../../../db/index.js';
import { logger } from '../../shared/logger.js';
import { insertAlertIfNotDuplicate } from './alerts-store.js';
import { dispatchAlert } from './dispatch.js';
import { type NudgeSink } from './dispatchers/nudge.js';
import { evaluateBudgetThreshold } from './evaluators/budget.js';
import { evaluateErrorSpike } from './evaluators/error-spike.js';
import { evaluateLatencyDegradation } from './evaluators/latency.js';
import { ruleRowToRule } from './mappers.js';

import type { AlertCandidate, AlertRule, DispatchedAlert, FiredAlert } from './types.js';

export { DEDUP_WINDOW_MINUTES, acknowledgeAlert, listAlerts } from './alerts-store.js';
export type { ListAlertsFilters } from './alerts-store.js';

interface EvaluatorDeps {
  db: AiDb;
  now: Date;
}

export interface RunEvaluationOptions {
  /** Override "now" for deterministic tests. */
  now?: Date;
  /** Skip channel dispatch (used in tests that only assert on rows). */
  dispatch?: boolean;
  /** Cerebrum nudge sink threaded to the nudge dispatcher (tests stub it). */
  nudgeSink?: NudgeSink;
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
export function loadEnabledRules(db: AiDb): AlertRule[] {
  return db.select().from(aiAlertRules).where(eq(aiAlertRules.enabled, 1)).all().map(ruleRowToRule);
}

async function dispatchPersistedAlert(
  alert: FiredAlert,
  dispatchEnabled: boolean,
  nudgeSink?: NudgeSink
): Promise<DispatchedAlert> {
  if (!dispatchEnabled) return { ...alert, channels: [] };
  const results = await dispatchAlert(alert, nudgeSink ? { nudgeSink } : {});
  const channels = results.filter((r) => r.delivered).map((r) => r.channel);
  return { ...alert, channels };
}

/**
 * Run the full evaluation cycle: load rules → evaluate → dedupe → persist →
 * dispatch. Returns counters + the alerts that fired this cycle.
 */
export async function runEvaluation(
  db: AiDb,
  options: RunEvaluationOptions = {}
): Promise<RunEvaluationResult> {
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
      fired.push(await dispatchPersistedAlert(persisted, dispatchEnabled, options.nudgeSink));
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
