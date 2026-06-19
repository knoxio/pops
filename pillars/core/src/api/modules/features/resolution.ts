import { getSettingOrNull } from '../../../db/services/settings.js';
import { getUserSetting } from '../../../db/services/user-settings.js';
/**
 * Internal resolution machinery for the feature-toggle service.
 *
 * Holds the registry-snapshot read, the per-feature gate resolution
 * (capability → credentials → user override → system value → default), and the
 * `FeatureStatus` projection. `service.ts` is the thin public surface over
 * these helpers — splitting keeps each file focused and within the line budget.
 */
import { buildRegistrySnapshot } from '../registry/snapshot.js';
import {
  buildSettingsFieldIndex,
  resolveCredentials,
  type SettingsFieldIndex,
} from './credentials.js';

import type { FeatureManifestDescriptor, SettingsManifestDescriptor } from '@pops/pillar-sdk';
import type { FeatureStatus } from '@pops/types';

import type { CoreDb } from '../../../db/services/internal.js';

/** Prefix every per-user feature key is stored under in `user_settings`. */
export const USER_SETTING_PREFIX = 'feature.';

/** Owning pillar id reserved for core-local capability probes. */
const CORE_PILLAR_ID = 'core';

/** Identity context for per-user resolution (S2's handler supplies the email). */
export interface UserContext {
  email: string;
}

/**
 * A live capability probe — `true` when the underlying runtime supports the
 * capability. Keyed by `[pillar][capabilityKey]`. Only `core` probes are
 * meaningful today (core resolves its own capabilities in-process); other
 * pillars' entries are ignored until S3 wires the heartbeat capability
 * snapshot.
 */
export type CapabilityProbes = Readonly<Record<string, Readonly<Record<string, () => boolean>>>>;

/** A feature descriptor tagged with the pillar that declared it. */
export interface ResolvedFeatureEntry {
  pillarId: string;
  feature: FeatureManifestDescriptor;
}

/**
 * The aggregated, registry-sourced view a single resolution pass operates on:
 * every declared feature (tagged by owning pillar, in registry order) plus the
 * flattened settings-field index used for credential resolution. Built once
 * from `buildRegistrySnapshot(db)` so a pass reads the snapshot exactly once.
 */
export interface RegistryFeatureView {
  features: readonly ResolvedFeatureEntry[];
  settingsFields: SettingsFieldIndex;
  /** Pillar ids in registry order — surfaced on `FeatureNotFoundError`. */
  pillarIds: readonly string[];
}

/** Inputs that vary per caller but not per feature within a resolution pass. */
export interface ResolutionContext {
  probes: CapabilityProbes;
  user: UserContext | null;
}

export function userSettingKey(featureKey: string): string {
  return `${USER_SETTING_PREFIX}${featureKey}`;
}

function parseBoolean(raw: string | null | undefined, fallback: boolean): boolean {
  if (raw === null || raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Read the live registry snapshot and project it into the aggregated feature
 * view. This is the ONLY feature source — there is no static pillar list.
 */
export function readRegistryFeatureView(db: CoreDb): RegistryFeatureView {
  const snapshot = buildRegistrySnapshot(db);
  const features: ResolvedFeatureEntry[] = [];
  const settingsManifests: SettingsManifestDescriptor[] = [];
  const pillarIds: string[] = [];

  for (const pillar of snapshot.pillars) {
    pillarIds.push(pillar.pillarId);
    for (const feature of pillar.manifest.features ?? []) {
      features.push({ pillarId: pillar.pillarId, feature });
    }
    for (const manifest of pillar.manifest.settings?.manifests ?? []) {
      settingsManifests.push(manifest);
    }
  }

  return {
    features,
    settingsFields: buildSettingsFieldIndex(settingsManifests),
    pillarIds,
  };
}

/** Resolve a feature key against the view; `null` when no pillar declares it. */
export function findFeature(view: RegistryFeatureView, key: string): ResolvedFeatureEntry | null {
  return view.features.find((entry) => entry.feature.key === key) ?? null;
}

/**
 * Resolve the declarative `capability` descriptor to a live up/down boolean.
 *
 * - No `capability` descriptor → no capability gate (`true`).
 * - `pillar === 'core'` → resolve against the in-process probe map; absent
 *   probe ⇒ `false` (the backing runtime is not wired in this process).
 * - cross-pillar → `false` for now.
 *
 * TODO(S3): cross-pillar capabilities must resolve against the owning pillar's
 * last-reported capability status from the registry heartbeat snapshot (the
 * extended heartbeat in epic 05 / S3). Until that lands, a cross-pillar
 * capability feature is reported `unavailable` rather than fabricating a probe
 * core cannot perform.
 */
export function resolveCapabilityOk(
  feature: FeatureManifestDescriptor,
  probes: CapabilityProbes
): boolean {
  const capability = feature.capability;
  if (!capability) return true;

  if (capability.pillar === CORE_PILLAR_ID) {
    const probe = probes[CORE_PILLAR_ID]?.[capability.key];
    return probe ? probe() : false;
  }

  return false;
}

export function readSystemValue(db: CoreDb, feature: FeatureManifestDescriptor): boolean | null {
  const key = feature.settingKey ?? feature.key;
  const row = getSettingOrNull(db, key);
  if (!row) return null;
  return parseBoolean(row.value, feature.default);
}

export function readUserOverride(
  db: CoreDb,
  feature: FeatureManifestDescriptor,
  user: UserContext
): boolean | null {
  if (feature.scope !== 'user') return null;
  const raw = getUserSetting(db, user.email, userSettingKey(feature.key));
  if (raw === null) return null;
  return parseBoolean(raw, feature.default);
}

interface ResolvedState {
  enabled: boolean;
  userOverride: boolean;
}

function resolveEnabledState(
  db: CoreDb,
  feature: FeatureManifestDescriptor,
  gateOk: boolean,
  user: UserContext | null
): ResolvedState {
  if (!gateOk) return { enabled: false, userOverride: false };

  if (feature.scope === 'user' && user) {
    const userValue = readUserOverride(db, feature, user);
    if (userValue !== null) return { enabled: userValue, userOverride: true };
  }

  const systemValue = readSystemValue(db, feature);
  return { enabled: systemValue ?? feature.default, userOverride: false };
}

function deriveState(gateOk: boolean, enabled: boolean): FeatureStatus['state'] {
  if (!gateOk) return 'unavailable';
  return enabled ? 'enabled' : 'disabled';
}

/** Project a single declared feature onto its resolved `FeatureStatus`. */
export function buildFeatureStatus(
  db: CoreDb,
  entry: ResolvedFeatureEntry,
  view: RegistryFeatureView,
  ctx: ResolutionContext
): FeatureStatus {
  const { pillarId, feature } = entry;
  const capabilityOk = resolveCapabilityOk(feature, ctx.probes);
  const capabilityMissing = feature.capability ? !capabilityOk : false;
  const { credentials, allConfigured } = resolveCredentials(db, feature, view.settingsFields);
  const gateOk = !capabilityMissing && allConfigured;
  const { enabled, userOverride } = resolveEnabledState(db, feature, gateOk, ctx.user);

  return {
    key: feature.key,
    manifestId: pillarId,
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
