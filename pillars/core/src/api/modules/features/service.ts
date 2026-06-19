/**
 * Feature-toggle service for the core pillar (epic 05 / S1).
 *
 * The single read path for runtime feature gating plus the admin Features
 * page surface. Feature declarations are sourced from the **live registry
 * snapshot** — every registered pillar's manifest `features` slot is
 * aggregated in-process. There is no static pillar list and no build-time
 * module enumeration: a pillar that self-registers with a `features` slot
 * surfaces here automatically (the self-registration invariant, epic 05).
 *
 * Resolution order (`isEnabled` / `buildFeatureStatus`):
 *   capability probe → required credentials → user override → system value → default.
 *
 * Storage reuses core's existing tables (no new tables):
 *   - system flags → `settings` (`setRawSetting` / `getSettingOrNull`, key
 *     `feature.settingKey ?? key`)
 *   - per-user prefs → `user_settings` (per email, key `feature.<key>`)
 *
 * Capability resolution is the declarative `capability: { pillar, key }`
 * descriptor (S0 replaced the non-serializable `capabilityCheck()` fn).
 * Core-local capabilities (`pillar: 'core'`) resolve against an in-process
 * probe map supplied by the caller; cross-pillar capabilities resolve to
 * `unavailable` for now (deferred to S3 — the extended heartbeat will report
 * live per-pillar capability status into the registry snapshot). See
 * `resolution.ts` for the gate machinery.
 */
import { setRawSetting } from '../../../db/services/settings.js';
import { deleteUserSetting, setUserSetting } from '../../../db/services/user-settings.js';
import { resolveCredentials } from './credentials.js';
import { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';
import {
  buildFeatureStatus,
  findFeature,
  readRegistryFeatureView,
  readSystemValue,
  readUserOverride,
  resolveCapabilityOk,
  userSettingKey,
  type CapabilityProbes,
  type RegistryFeatureView,
  type ResolvedFeatureEntry,
  type UserContext,
} from './resolution.js';

import type { FeatureManifestDescriptor } from '@pops/pillar-sdk';
import type { FeatureCredentialStatus, FeatureManifest, FeatureStatus } from '@pops/types';

import type { CoreDb } from '../../../db/services/internal.js';

export { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';
export type { CapabilityProbes, UserContext } from './resolution.js';

export interface FeatureServiceOptions {
  /**
   * In-process probes for core-local capabilities. When a `core` capability
   * feature names a probe that is absent here, the feature resolves to
   * `unavailable` (the runtime that backs it is not wired in this process).
   */
  capabilityProbes?: CapabilityProbes;
}

interface IsEnabledOptions {
  user?: UserContext | null;
}

/**
 * Resolve a feature key, throwing `FeatureNotFoundError` (naming the searched
 * pillar ids) when no registered pillar declares it.
 */
function requireFeature(view: RegistryFeatureView, key: string): ResolvedFeatureEntry {
  const entry = findFeature(view, key);
  if (entry) return entry;
  throw new FeatureNotFoundError(key, view.pillarIds);
}

function probesOf(options: FeatureServiceOptions): CapabilityProbes {
  return options.capabilityProbes ?? {};
}

/**
 * The single read path for runtime feature gating. Resolves in order:
 * capability probe → required credentials → user override → system value → default.
 *
 * Throws `FeatureNotFoundError` when the key is not declared by any registered
 * pillar — a deliberate breaking change from the pre-PRD-101 silent-`false`
 * behaviour: manifest-declared features can't drift, so a missing key is a bug.
 */
export function isEnabled(
  db: CoreDb,
  key: string,
  options: IsEnabledOptions = {},
  serviceOptions: FeatureServiceOptions = {}
): boolean {
  const view = readRegistryFeatureView(db);
  const { feature } = requireFeature(view, key);

  if (feature.capability && !resolveCapabilityOk(feature, probesOf(serviceOptions))) return false;

  const { allConfigured } = resolveCredentials(db, feature, view.settingsFields);
  if (!allConfigured) return false;

  if (feature.scope === 'user' && options.user) {
    const userValue = readUserOverride(db, feature, options.user);
    if (userValue !== null) return userValue;
  }

  const systemValue = readSystemValue(db, feature);
  return systemValue ?? feature.default;
}

/** Build the `FeatureStatus` list for the admin Features page. */
export function listFeatures(
  db: CoreDb,
  user: UserContext | null = null,
  serviceOptions: FeatureServiceOptions = {}
): FeatureStatus[] {
  const view = readRegistryFeatureView(db);
  const ctx = { probes: probesOf(serviceOptions), user };
  return view.features.map((entry) => buildFeatureStatus(db, entry, view, ctx));
}

function toManifestFeature(
  feature: FeatureManifestDescriptor
): FeatureManifest['features'][number] {
  return {
    key: feature.key,
    label: feature.label,
    description: feature.description,
    default: feature.default,
    scope: feature.scope,
    requires: feature.requires,
    requiresEnv: feature.requiresEnv,
    preview: feature.preview,
    deprecated: feature.deprecated,
    settingKey: feature.settingKey,
    configureLink: feature.configureLink,
  };
}

/**
 * Return one `FeatureManifest` per registered pillar that declares features,
 * grouping that pillar's feature descriptors under its pillar id. The wire
 * descriptor carries no title/order/icon, so the pillar id stands in for the
 * group title and the registry order supplies `order`. Consumed by the admin
 * Features page.
 */
export function getFeatureManifests(db: CoreDb): readonly FeatureManifest[] {
  const view = readRegistryFeatureView(db);
  const byPillar = new Map<string, FeatureManifest>();
  const orderByPillar = new Map<string, number>();
  view.pillarIds.forEach((id, index) => orderByPillar.set(id, index));

  for (const { pillarId, feature } of view.features) {
    let manifest = byPillar.get(pillarId);
    if (!manifest) {
      manifest = {
        id: pillarId,
        title: pillarId,
        order: orderByPillar.get(pillarId) ?? 0,
        features: [],
      };
      byPillar.set(pillarId, manifest);
    }
    manifest.features.push(toManifestFeature(feature));
  }

  return [...byPillar.values()].toSorted((a, b) => a.order - b.order);
}

function missingCredentials(credentials: FeatureCredentialStatus[]): FeatureCredentialStatus[] {
  return credentials.filter((c) => c.source === 'missing');
}

function ensureCanEnable(
  db: CoreDb,
  feature: FeatureManifestDescriptor,
  view: RegistryFeatureView,
  probes: CapabilityProbes
): void {
  if (feature.capability && !resolveCapabilityOk(feature, probes)) {
    throw new FeatureGateError(feature.key, [{ key: feature.key, source: 'missing' }]);
  }
  const { credentials, allConfigured } = resolveCredentials(db, feature, view.settingsFields);
  if (!allConfigured) {
    throw new FeatureGateError(feature.key, missingCredentials(credentials));
  }
}

/**
 * Set the system-level enabled state. Rejects `capability`-scoped features
 * (read-only runtime probes) and rejects enabling while gating is failing.
 */
export function setFeatureEnabled(
  db: CoreDb,
  key: string,
  enabled: boolean,
  serviceOptions: FeatureServiceOptions = {}
): boolean {
  const view = readRegistryFeatureView(db);
  const { feature } = requireFeature(view, key);

  if (feature.scope === 'capability') {
    throw new FeatureScopeError(key, 'system|user', feature.scope);
  }
  if (enabled) ensureCanEnable(db, feature, view, probesOf(serviceOptions));

  setRawSetting(db, feature.settingKey ?? feature.key, enabled ? 'true' : 'false');
  return enabled;
}

function requireUserScopedFeature(
  view: RegistryFeatureView,
  key: string
): FeatureManifestDescriptor {
  const { feature } = requireFeature(view, key);
  if (feature.scope !== 'user') {
    throw new FeatureScopeError(key, 'user', feature.scope);
  }
  return feature;
}

/** Set a per-user override. Rejects when the feature is not user-scoped. */
export function setUserPreference(
  db: CoreDb,
  key: string,
  user: UserContext,
  enabled: boolean
): boolean {
  const view = readRegistryFeatureView(db);
  const feature = requireUserScopedFeature(view, key);
  setUserSetting(db, user.email, userSettingKey(feature.key), enabled ? 'true' : 'false');
  return enabled;
}

/** Remove a per-user override; resolution falls back to the system default. */
export function clearUserPreference(db: CoreDb, key: string, user: UserContext): boolean {
  const view = readRegistryFeatureView(db);
  const feature = requireUserScopedFeature(view, key);
  return deleteUserSetting(db, user.email, userSettingKey(feature.key));
}
