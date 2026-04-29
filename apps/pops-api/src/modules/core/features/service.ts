import { setRawSetting, getSettingOrNull } from '../settings/service.js';
import { resolveCredentials } from './credentials.js';
import { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';
import { featuresRegistry } from './registry.js';
import { deleteUserSetting, getUserSetting, setUserSetting } from './user-settings.js';

import type { FeatureDefinition, FeatureStatus } from '@pops/types';

export { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';

const USER_SETTING_PREFIX = 'feature.';

interface UserContext {
  email: string;
}

interface IsEnabledOptions {
  user?: UserContext | null;
}

function userSettingKey(featureKey: string): string {
  return `${USER_SETTING_PREFIX}${featureKey}`;
}

function parseBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

function readSystemValue(feature: FeatureDefinition): boolean | null {
  const key = feature.settingKey ?? feature.key;
  const row = getSettingOrNull(key);
  if (!row) return null;
  return parseBoolean(row.value, feature.default);
}

function writeSystemValue(feature: FeatureDefinition, enabled: boolean): void {
  setRawSetting(feature.settingKey ?? feature.key, enabled ? 'true' : 'false');
}

function readUserOverride(feature: FeatureDefinition, user: UserContext): boolean | null {
  if (feature.scope !== 'user') return null;
  const raw = getUserSetting(user.email, userSettingKey(feature.key));
  if (raw === null) return null;
  return parseBoolean(raw, feature.default);
}

interface ResolvedState {
  enabled: boolean;
  userOverride: boolean;
}

function resolveEnabledState(
  feature: FeatureDefinition,
  gateOk: boolean,
  user: UserContext | null
): ResolvedState {
  if (!gateOk) return { enabled: false, userOverride: false };

  if (feature.scope === 'user' && user) {
    const userValue = readUserOverride(feature, user);
    if (userValue !== null) return { enabled: userValue, userOverride: true };
  }

  const systemValue = readSystemValue(feature);
  return { enabled: systemValue ?? feature.default, userOverride: false };
}

function deriveState(gateOk: boolean, enabled: boolean): FeatureStatus['state'] {
  if (!gateOk) return 'unavailable';
  return enabled ? 'enabled' : 'disabled';
}

function buildFeatureStatus(
  manifestId: string,
  feature: FeatureDefinition,
  user: UserContext | null
): FeatureStatus {
  const capabilityMissing = feature.capabilityCheck ? !feature.capabilityCheck() : false;
  const { credentials, allConfigured } = resolveCredentials(feature);
  const gateOk = !capabilityMissing && allConfigured;
  const { enabled, userOverride } = resolveEnabledState(feature, gateOk, user);

  return {
    key: feature.key,
    manifestId,
    label: feature.label,
    description: feature.description,
    scope: feature.scope,
    enabled,
    default: feature.default,
    state: deriveState(gateOk, enabled),
    credentials,
    capabilityMissing: capabilityMissing || undefined,
    preview: feature.preview,
    deprecated: feature.deprecated,
    configureLink: feature.configureLink,
    userOverride: feature.scope === 'user' ? userOverride : undefined,
  };
}

/**
 * The single read path for runtime feature gating. Resolves in order:
 * capability check → required credentials → user override → system value → default.
 */
export function isEnabled(key: string, options: IsEnabledOptions = {}): boolean {
  const entry = featuresRegistry.getFeature(key);
  if (!entry) {
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(`[features] isEnabled called for unknown feature "${key}"`);
    }
    return false;
  }

  const { feature } = entry;
  if (feature.capabilityCheck && !feature.capabilityCheck()) return false;

  const { allConfigured } = resolveCredentials(feature);
  if (!allConfigured) return false;

  if (feature.scope === 'user' && options.user) {
    const userValue = readUserOverride(feature, options.user);
    if (userValue !== null) return userValue;
  }

  const systemValue = readSystemValue(feature);
  return systemValue ?? feature.default;
}

/** Build the FeatureStatus list for the admin Features page. */
export function listFeatures(user: UserContext | null = null): FeatureStatus[] {
  const out: FeatureStatus[] = [];
  for (const manifest of featuresRegistry.getAll()) {
    for (const feature of manifest.features) {
      out.push(buildFeatureStatus(manifest.id, feature, user));
    }
  }
  return out;
}

function ensureCanEnable(feature: FeatureDefinition): void {
  if (feature.capabilityCheck && !feature.capabilityCheck()) {
    throw new FeatureGateError(feature.key, [{ key: feature.key, source: 'missing' }]);
  }
  const { credentials, allConfigured } = resolveCredentials(feature);
  if (!allConfigured) {
    throw new FeatureGateError(
      feature.key,
      credentials.filter((c) => c.source === 'missing')
    );
  }
}

/** Set the system-level enabled state. Rejects when gating is failing. */
export function setFeatureEnabled(key: string, enabled: boolean): boolean {
  const entry = featuresRegistry.getFeature(key);
  if (!entry) throw new FeatureNotFoundError(key);
  const { feature } = entry;

  if (feature.scope === 'capability') {
    throw new FeatureScopeError(key, 'system|user', feature.scope);
  }
  if (enabled) ensureCanEnable(feature);

  writeSystemValue(feature, enabled);
  return enabled;
}

function requireUserScopedFeature(key: string): FeatureDefinition {
  const entry = featuresRegistry.getFeature(key);
  if (!entry) throw new FeatureNotFoundError(key);
  if (entry.feature.scope !== 'user') {
    throw new FeatureScopeError(key, 'user', entry.feature.scope);
  }
  return entry.feature;
}

/** Set a per-user override. Rejects when the feature is not user-scoped. */
export function setUserPreference(key: string, user: UserContext, enabled: boolean): boolean {
  const feature = requireUserScopedFeature(key);
  setUserSetting(user.email, userSettingKey(feature.key), enabled ? 'true' : 'false');
  return enabled;
}

/** Remove a per-user override; resolution falls back to the system default. */
export function clearUserPreference(key: string, user: UserContext): boolean {
  const feature = requireUserScopedFeature(key);
  return deleteUserSetting(user.email, userSettingKey(feature.key));
}
