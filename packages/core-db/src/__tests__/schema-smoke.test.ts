/**
 * Smoke-import test for the relocated core schemas (PRD-245 US-07).
 *
 * Every drizzle table moved from `@pops/db-types/schema/` into this
 * package must resolve through the public barrel and carry the original
 * SQL table name. If the relocation drops a binding or accidentally
 * renames the SQL identifier, this test fails first.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  aiAlertRules,
  aiAlerts,
  aiBudgets,
  aiInferenceDaily,
  aiInferenceLog,
  aiModelPricing,
  aiProviders,
  aiUsage,
  entities,
  environments,
  pillarRegistry,
  serviceAccounts,
  settings,
  syncJobResults,
  transactionCorrections,
  userSettings,
} from '../schema.js';

describe('PRD-245 US-07 relocated schema bindings', () => {
  it.each([
    [aiAlertRules, 'ai_alert_rules'],
    [aiAlerts, 'ai_alerts'],
    [aiBudgets, 'ai_budgets'],
    [aiInferenceDaily, 'ai_inference_daily'],
    [aiInferenceLog, 'ai_inference_log'],
    [aiModelPricing, 'ai_model_pricing'],
    [aiProviders, 'ai_providers'],
    [aiUsage, 'ai_usage'],
    [entities, 'entities'],
    [environments, 'environments'],
    [pillarRegistry, 'pillar_registry'],
    [serviceAccounts, 'service_accounts'],
    [settings, 'settings'],
    [syncJobResults, 'sync_job_results'],
    [transactionCorrections, 'transaction_corrections'],
    [userSettings, 'user_settings'],
  ])('resolves table %# with expected SQL name', (table, expected) => {
    expect(getTableName(table)).toBe(expected);
  });
});
