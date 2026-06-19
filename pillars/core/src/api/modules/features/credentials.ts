/**
 * Credential resolution for feature gating.
 *
 * A feature's `requires` lists settings keys whose resolved value (DB value
 * or the field's `envFallback`) must be non-empty; `requiresEnv` lists
 * environment variables that must be non-empty. This module answers "is each
 * required credential present, and where does it come from?".
 *
 * The settings-field schema (which carries the `envFallback` mapping) is read
 * from the **registry snapshot's per-pillar settings descriptors** — NOT from
 * `@pops/module-registry`. A pillar declares its settings fields in the same
 * manifest it self-registers with, so the registry snapshot is the only
 * source needed; this preserves the self-registration invariant (no static
 * pillar list, no build-time module enumeration).
 */
import { getSettingOrNull } from '../../../db/services/settings.js';

import type { FeatureManifestDescriptor, SettingsManifestDescriptor } from '@pops/pillar-sdk';
import type { FeatureCredentialStatus } from '@pops/types';

import type { CoreDb } from '../../../db/services/internal.js';

/**
 * An indexed view of every settings field declared across the registered
 * pillars, keyed by the field's settings key. Built once per resolution pass
 * from the registry snapshot so credential lookups are O(1).
 */
export type SettingsFieldIndex = ReadonlyMap<string, { envFallback?: string }>;

/**
 * Flatten the settings descriptors from every registered pillar into a
 * `key → field` index. Later declarations of the same key win (the snapshot
 * is ordered by pillar id), which is consistent with the feature aggregator's
 * "first match wins" only at the feature-key level — settings keys are
 * globally namespaced, so a collision here is a manifest authoring bug, not a
 * resolution ambiguity.
 */
export function buildSettingsFieldIndex(
  settingsManifests: readonly SettingsManifestDescriptor[]
): SettingsFieldIndex {
  const index = new Map<string, { envFallback?: string }>();
  for (const manifest of settingsManifests) {
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        index.set(field.key, { envFallback: field.envFallback });
      }
    }
  }
  return index;
}

function readEnv(name: string): string | undefined {
  return process.env[name];
}

/** Resolve a setting key's value via DB, then the field's `envFallback`. */
function resolveSettingCredential(
  db: CoreDb,
  key: string,
  fields: SettingsFieldIndex
): FeatureCredentialStatus {
  const dbRow = getSettingOrNull(db, key);
  if (dbRow && dbRow.value !== '') {
    return { key, source: 'database' };
  }

  const envVar = fields.get(key)?.envFallback;
  if (envVar) {
    const envValue = readEnv(envVar);
    if (envValue && envValue !== '') {
      return { key, source: 'environment', envVar };
    }
    return { key, source: 'missing', envVar };
  }

  return { key, source: 'missing' };
}

/** Resolve an env-only credential (`requiresEnv`). */
function resolveEnvCredential(envVar: string): FeatureCredentialStatus {
  const envValue = readEnv(envVar);
  if (envValue && envValue !== '') {
    return { key: envVar, source: 'environment', envVar };
  }
  return { key: envVar, source: 'missing', envVar };
}

export interface ResolvedCredentials {
  credentials: FeatureCredentialStatus[];
  allConfigured: boolean;
}

/** Resolve all `requires` and `requiresEnv` for a feature descriptor. */
export function resolveCredentials(
  db: CoreDb,
  feature: FeatureManifestDescriptor,
  fields: SettingsFieldIndex
): ResolvedCredentials {
  const credentials: FeatureCredentialStatus[] = [];
  for (const key of feature.requires ?? []) {
    credentials.push(resolveSettingCredential(db, key, fields));
  }
  for (const envVar of feature.requiresEnv ?? []) {
    credentials.push(resolveEnvCredential(envVar));
  }
  const allConfigured = credentials.every((c) => c.source !== 'missing');
  return { credentials, allConfigured };
}
