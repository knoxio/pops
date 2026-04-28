/**
 * Resolve a settings value at runtime — returns the DB-stored value if present,
 * otherwise falls back to the provided default. The lookup is synchronous
 * because the settings table is a small key-value store in the same SQLite
 * database and reads are fast.
 *
 * When the database is unavailable (e.g. during unit tests that don't set up
 * a full DB context), the functions silently return the default value. This
 * ensures settings-backed constants don't break test suites that import
 * modules using them.
 */
import type { SettingsKey } from '@pops/types';

import { getSettingOrNull } from './service.js';

/** Read a string setting, falling back to `defaultValue` if not stored. */
export function resolveString(key: SettingsKey, defaultValue: string): string {
  try {
    const row = getSettingOrNull(key);
    return row?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/** Read a numeric setting, falling back to `defaultValue` if not stored or unparsable. */
export function resolveNumber(key: SettingsKey, defaultValue: number): number {
  try {
    const row = getSettingOrNull(key);
    if (!row) return defaultValue;
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}
