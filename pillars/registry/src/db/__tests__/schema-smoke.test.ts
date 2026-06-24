/**
 * Smoke test that the registry schemas resolve with the expected drizzle
 * SQL `name`.
 *
 * Catches "table renamed but the export forgot to flip" mistakes.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  environments,
  pillarRegistry,
  serviceAccounts,
  settings,
  userSettings,
} from '../schema.js';

describe('registry schema name resolution', () => {
  // AI-ops observability tables live in the `ai` pillar; `ai_usage` lives in
  // finance — none of them belong to the registry schema set below.
  it.each([
    [environments, 'environments'],
    [pillarRegistry, 'pillar_registry'],
    [serviceAccounts, 'service_accounts'],
    [settings, 'settings'],
    [userSettings, 'user_settings'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
