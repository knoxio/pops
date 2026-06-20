/**
 * Smoke test that the relocated core schemas (PRD-245 US-07 /
 * audit H6) resolve from `@pops/core-db` with the expected drizzle
 * SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-07-relocate-core-schemas.md` so a regression on either side
 * trips this file.
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
  userSettings,
} from '../schema.js';

describe('PRD-245 US-07 core schema relocation', () => {
  it.each([
    [entities, 'entities'],
    [environments, 'environments'],
    [pillarRegistry, 'pillar_registry'],
    [serviceAccounts, 'service_accounts'],
    [settings, 'settings'],
    [userSettings, 'user_settings'],
    [aiAlertRules, 'ai_alert_rules'],
    [aiAlerts, 'ai_alerts'],
    [aiBudgets, 'ai_budgets'],
    [aiInferenceDaily, 'ai_inference_daily'],
    [aiInferenceLog, 'ai_inference_log'],
    [aiModelPricing, 'ai_model_pricing'],
    [aiProviders, 'ai_providers'],
    [aiUsage, 'ai_usage'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
