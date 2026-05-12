import { MODULES } from '@pops/module-registry';

import { getEnv } from '../../../env.js';
import { getSettingOrNull } from '../settings/service.js';

import type {
  FeatureCredentialStatus,
  FeatureDefinition,
  SettingsField,
  SettingsManifest,
} from '@pops/types';

/**
 * Find the `SettingsField` for a given key by scanning every installed
 * module's declared settings sections. Reads from the build-time module
 * registry (PRD-101 US-04 follow-up): `MODULES.flatMap(m => m.settings ?? [])`.
 *
 * The flatMap callback widens each module's narrow `settings` tuple back to
 * the contract type — the `satisfies readonly SettingsManifest[]` clause in
 * `generated.ts` already guards structural compatibility at codegen time.
 */
function findSettingsField(key: string): SettingsField | null {
  const sections = MODULES.flatMap((m): readonly SettingsManifest[] =>
    'settings' in m && m.settings !== undefined ? m.settings : []
  );
  for (const manifest of sections) {
    for (const group of manifest.groups) {
      const field = group.fields.find((f) => f.key === key);
      if (field) return field;
    }
  }
  return null;
}

/** Resolve a setting key's value via DB then envFallback. */
function resolveSettingCredential(key: string): FeatureCredentialStatus {
  const dbRow = getSettingOrNull(key);
  if (dbRow && dbRow.value !== '') {
    return { key, source: 'database' };
  }

  const field = findSettingsField(key);
  const envVar = field?.envFallback;
  if (envVar) {
    const envValue = getEnv(envVar);
    if (envValue && envValue !== '') {
      return { key, source: 'environment', envVar };
    }
    return { key, source: 'missing', envVar };
  }

  return { key, source: 'missing' };
}

/** Resolve an env-only credential. */
function resolveEnvCredential(envVar: string): FeatureCredentialStatus {
  const envValue = getEnv(envVar);
  if (envValue && envValue !== '') {
    return { key: envVar, source: 'environment', envVar };
  }
  return { key: envVar, source: 'missing', envVar };
}

export interface ResolvedCredentials {
  credentials: FeatureCredentialStatus[];
  allConfigured: boolean;
}

/** Resolve all `requires` and `requiresEnv` for a feature. */
export function resolveCredentials(feature: FeatureDefinition): ResolvedCredentials {
  const credentials: FeatureCredentialStatus[] = [];
  for (const key of feature.requires ?? []) {
    credentials.push(resolveSettingCredential(key));
  }
  for (const envVar of feature.requiresEnv ?? []) {
    credentials.push(resolveEnvCredential(envVar));
  }
  const allConfigured = credentials.every((c) => c.source !== 'missing');
  return { credentials, allConfigured };
}
