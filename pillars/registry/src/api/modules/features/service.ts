/**
 * Feature-toggle service: the single read path for runtime feature gating plus
 * the admin Features page surface.
 *
 * Feature declarations are sourced from the **live registry snapshot** — every
 * registered pillar's manifest `features` slot is aggregated in-process. There
 * is no static pillar list and no build-time module enumeration: a pillar that
 * self-registers with a `features` slot surfaces here automatically.
 *
 * Resolution order (`isEnabled` / `buildFeatureStatus`):
 *   capability probe → required credentials → user override → system value → default.
 *
 * Storage reuses the registry's existing tables:
 *   - system flags → `settings` (`setRawSetting` / `getSettingOrNull`, key
 *     `feature.settingKey ?? key`)
 *   - per-user prefs → `user_settings` (per email, key `feature.<key>`)
 *
 * Capability resolution is the declarative `capability: { pillar, key }`
 * descriptor (serializable, so it survives the wire). Every capability feature
 * resolves uniformly against the owning pillar's last-reported status on the
 * registry snapshot (`pillars[].capabilities`, self-reported on register /
 * heartbeat). A pillar that has not reported a capability resolves to
 * `unavailable`, preserving graceful degradation. See `resolution.ts` for the
 * gate machinery.
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
  type RegistryFeatureView,
  type ResolvedFeatureEntry,
  type UserContext,
} from './resolution.js';

import type { FeatureManifestDescriptor } from '@pops/pillar-sdk';
import type { FeatureCredentialStatus, FeatureManifest, FeatureStatus } from '@pops/types';

import type { CoreDb } from '../../../db/services/internal.js';

export { FeatureGateError, FeatureNotFoundError, FeatureScopeError } from './errors.js';
export type { UserContext } from './resolution.js';

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

/**
 * The single read path for runtime feature gating. Resolves in order:
 * capability status → required credentials → user override → system value → default.
 *
 * Throws `FeatureNotFoundError` when the key is not declared by any registered
 * pillar — manifest-declared features can't drift, so a missing key is a bug
 * rather than a silent `false` (feature-toggles-framework).
 */
export function isEnabled(db: CoreDb, key: string, options: IsEnabledOptions = {}): boolean {
  const view = readRegistryFeatureView(db);
  const { feature } = requireFeature(view, key);

  if (feature.capability && !resolveCapabilityOk(feature, view.capabilities)) return false;

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
export function listFeatures(db: CoreDb, user: UserContext | null = null): FeatureStatus[] {
  const view = readRegistryFeatureView(db);
  return view.features.map((entry) => buildFeatureStatus(db, entry, view, { user }));
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
  view: RegistryFeatureView
): void {
  if (feature.capability && !resolveCapabilityOk(feature, view.capabilities)) {
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
export function setFeatureEnabled(db: CoreDb, key: string, enabled: boolean): boolean {
  const view = readRegistryFeatureView(db);
  const { feature } = requireFeature(view, key);

  if (feature.scope === 'capability') {
    throw new FeatureScopeError(key, 'system|user', feature.scope);
  }
  if (enabled) ensureCanEnable(db, feature, view);

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
