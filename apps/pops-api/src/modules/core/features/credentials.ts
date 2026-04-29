import { getEnv } from '../../../env.js';
import { settingsRegistry } from '../settings/registry.js';
import { getSettingOrNull } from '../settings/service.js';

import type { FeatureCredentialStatus, FeatureDefinition, SettingsField } from '@pops/types';

/** Find the SettingsField (across all settings manifests) for a given key. */
function findSettingsField(key: string): SettingsField | null {
  for (const manifest of settingsRegistry.getAll()) {
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
