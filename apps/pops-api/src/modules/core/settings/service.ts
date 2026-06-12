/**
 * Settings wrapper — resolves the core-pillar drizzle handle and forwards
 * to `@pops/core-db`'s `settingsService` (PRD-183 PR 2 cutover).
 *
 * Mirrors the movies / shelf-impressions cutover pattern: in-tree callers
 * (router.ts plus ~45 modules across pops-api) keep importing from this
 * file unchanged. The handle now points at the core pillar's per-pillar
 * SQLite via `getCoreDrizzle()` instead of the shared `pops.db` singleton,
 * so every settings read/write lands in `core.db.settings`. The legacy
 * mount still serves the same rows because the core backfill keeps both
 * stores in sync until the shim is retired.
 *
 * Error translation: the package surface throws `SettingNotFoundError`.
 * We re-throw it as the in-tree `NotFoundError` so the router's
 * `instanceof` checks (and callers that catch the same shape) keep
 * working without churn.
 */
import { SettingNotFoundError, settingsService } from '@pops/core-db';

import { getCoreDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type { SettingsKey } from './keys.js';
import type { SetSettingInput, SettingRow } from './types.js';

function translate<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof SettingNotFoundError) {
      throw new NotFoundError('Setting', err.key);
    }
    throw err;
  }
}

/** Get a single setting by key */
export function getSetting(key: SettingsKey): SettingRow {
  return translate(() => settingsService.getSetting(getCoreDrizzle(), key));
}

/** Get a single setting by key, returning null if not found */
export function getSettingOrNull(key: SettingsKey | string): SettingRow | null {
  return settingsService.getSettingOrNull(getCoreDrizzle(), key);
}

/** List settings with optional search filter */
export function listSettings(
  search: string | undefined,
  limit: number,
  offset: number
): { rows: SettingRow[]; total: number } {
  return settingsService.listSettings(getCoreDrizzle(), search, limit, offset);
}

/** Set a setting value (upsert — creates or updates) */
export function setSetting(input: SetSettingInput): SettingRow {
  return translate(() => settingsService.setSetting(getCoreDrizzle(), input));
}

/**
 * Untyped upsert into the settings table — used by callers that own their own
 * key namespace (e.g. the feature-toggle framework, which manages keys via the
 * features registry rather than `SETTINGS_KEYS`). Prefer `setSetting` whenever
 * the key is one of the typed `SettingsKey` values.
 */
export function setRawSetting(key: string, value: string): SettingRow {
  return translate(() => settingsService.setRawSetting(getCoreDrizzle(), key, value));
}

/** Get multiple settings by key — missing keys are omitted from the result */
export function getBulkSettings(keys: string[]): Record<string, string> {
  return settingsService.getBulkSettings(getCoreDrizzle(), keys);
}

/** Write multiple settings in a single transaction — rolls back all on any failure */
export function setBulkSettings(entries: { key: string; value: string }[]): Record<string, string> {
  return settingsService.setBulkSettings(getCoreDrizzle(), entries);
}

/**
 * Read a setting's value, returning `fallback` if the key does not exist in the
 * database or if the settings table is not available. This is the preferred way
 * for modules to consume settings — it avoids throwing on missing keys and
 * keeps the default co-located with the call site.
 *
 * Wraps the package surface in a try/catch so callers that fire early at
 * boot (before the per-pillar handle is available, or against test
 * fixtures that omit the settings table) gracefully degrade to the
 * hardcoded fallback instead of bubbling a SQLite error.
 */
export function getSettingValue<T extends string | number>(key: string, fallback: T): T {
  try {
    return settingsService.getSettingValue(getCoreDrizzle(), key, fallback);
  } catch {
    return fallback;
  }
}

/**
 * Resolve the LLM model for a specific pipeline.
 *
 * Read precedence:
 *  1. `ai.modelOverrides.<pipeline>` — explicit per-pipeline override
 *  2. The legacy `cerebrum.*.model` key, if one exists for this override
 *     (kept so users who customised the old keys don't lose their setting)
 *  3. `ai.model` — the global default
 *  4. `fallback` — the hardcoded compile-time floor
 *
 * Empty/whitespace-only values count as "not set" — an accidental blank
 * in the settings UI must not poison the model id passed to Anthropic.
 */
const LEGACY_OVERRIDE_KEYS = {
  'ai.modelOverrides.query': 'cerebrum.query.model',
  'ai.modelOverrides.emit': 'cerebrum.emit.model',
  'ai.modelOverrides.classifier': 'cerebrum.classifier.model',
  'ai.modelOverrides.entityExtractor': 'cerebrum.entityExtractor.model',
  'ai.modelOverrides.scopeInference': 'cerebrum.scopeInference.model',
  'ai.modelOverrides.auditorContradiction': 'cerebrum.auditor.contradictionModel',
  'ai.modelOverrides.patternContradiction': 'cerebrum.patterns.contradictionModel',
} as const;

export type AiModelOverrideKey = keyof typeof LEGACY_OVERRIDE_KEYS;

export function getAiModel(overrideKey: AiModelOverrideKey, fallback: string): string {
  const override = getSettingValue(overrideKey, '').trim();
  if (override) return override;
  const legacyValue = getSettingValue(LEGACY_OVERRIDE_KEYS[overrideKey], '').trim();
  if (legacyValue) return legacyValue;
  const globalDefault = getSettingValue('ai.model', '').trim();
  if (globalDefault) return globalDefault;
  return fallback;
}

/** Delete a setting by key */
export function deleteSetting(key: SettingsKey): void {
  translate(() => settingsService.deleteSetting(getCoreDrizzle(), key));
}
