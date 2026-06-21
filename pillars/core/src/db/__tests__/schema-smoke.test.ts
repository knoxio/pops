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
  aiUsage,
  entities,
  environments,
  pillarRegistry,
  serviceAccounts,
  settings,
  userSettings,
} from '../schema.js';

describe('PRD-245 US-07 core schema relocation', () => {
  // The AI-ops observability tables (ai_inference_log/daily, budgets,
  // alerts, providers, pricing) relocated to the `ai` pillar (PRD-055);
  // only the finance-categorizer `ai_usage` table remains core-owned.
  it.each([
    [entities, 'entities'],
    [environments, 'environments'],
    [pillarRegistry, 'pillar_registry'],
    [serviceAccounts, 'service_accounts'],
    [settings, 'settings'],
    [userSettings, 'user_settings'],
    [aiUsage, 'ai_usage'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
