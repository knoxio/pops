/**
 * Parity oracle for the ported feature-toggle service (epic 05 / S1).
 *
 * Faithful adaptation of the deleted monolith `service.test.ts`
 * (`apps/pops-api/src/modules/core/features/service.test.ts`, `6b0cc148^`)
 * to the pillar's reality:
 *   - feature declarations come from the **live registry snapshot** (fake
 *     pillars registered via `pillarRegistryService.upsertPillarRegistration`
 *     with a `features` slot), NOT a static module list;
 *   - service functions take a `CoreDb` handle first;
 *   - the runtime `capabilityCheck()` fn is replaced by the declarative
 *     `capability: { pillar, key }` descriptor + an injected probe map;
 *   - credential `envFallback` is sourced from the pillar's own manifest
 *     `settings` block carried on the same registration.
 *
 * The resolution order (capability → credentials → user override → system →
 * default), `FeatureNotFoundError` semantics, and `state` enum are preserved.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  openCoreDb,
  pillarRegistryService,
  settingsService,
  userSettingsService,
  type OpenedCoreDb,
} from '../../../../db/index.js';
import {
  clearUserPreference,
  FeatureGateError,
  FeatureNotFoundError,
  FeatureScopeError,
  getFeatureManifests,
  isEnabled,
  listFeatures,
  setFeatureEnabled,
  setUserPreference,
  type CapabilityProbes,
  type FeatureServiceOptions,
} from '../service.js';

import type {
  FeatureManifestDescriptor,
  ManifestPayload,
  SettingsManifestDescriptor,
} from '@pops/pillar-sdk';

import type { CoreDb } from '../../../../db/services/internal.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;
let db: CoreDb;

/** Probe map enabling a single core-local capability. */
function coreProbes(key: string, value: boolean): FeatureServiceOptions {
  const probes: CapabilityProbes = { core: { [key]: () => value } };
  return { capabilityProbes: probes };
}

function baseManifest(
  pillar: string,
  features: FeatureManifestDescriptor[],
  settings?: SettingsManifestDescriptor[]
): ManifestPayload {
  return {
    pillar,
    version: '0.1.0',
    contract: {
      package: `@pops/${pillar}-contract`,
      version: '0.1.0',
      tag: `contract-${pillar}@v0.1.0`,
    },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...(features.length > 0 ? { features } : {}),
    ...(settings && settings.length > 0 ? { settings: { manifests: settings } } : {}),
  };
}

/** Register a fake pillar into the live registry snapshot. */
function registerPillar(manifest: ManifestPayload): void {
  pillarRegistryService.upsertPillarRegistration(db, {
    baseUrl: `http://${manifest.pillar}-api:4010`,
    manifest,
    origin: 'external',
  });
}

/**
 * Register a single `test` pillar declaring one feature. Mirrors the deleted
 * suite's `registerSimpleFeature`.
 */
function registerSimpleFeature(
  overrides: Partial<FeatureManifestDescriptor> = {},
  settings?: SettingsManifestDescriptor[]
): void {
  const feature: FeatureManifestDescriptor = {
    key: 'test.simple',
    label: 'Simple',
    default: false,
    scope: 'system',
    ...overrides,
  };
  registerPillar(baseManifest('test', [feature], settings));
}

/** A settings manifest declaring credential fields (with optional envFallback). */
function settingsManifest(
  fields: { key: string; envFallback?: string }[]
): SettingsManifestDescriptor {
  return {
    id: 'test.settings',
    title: 'Test settings',
    order: 1,
    groups: [
      {
        id: 'g',
        title: 'g',
        fields: fields.map(({ key, envFallback }) => ({
          key,
          label: key,
          type: 'text' as const,
          ...(envFallback ? { envFallback } : {}),
        })),
      },
    ],
  };
}

function seedSetting(key: string, value: string): void {
  settingsService.setRawSetting(db, key, value);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-features-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
  db = coreDb.db;
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe('registry-sourced aggregation (self-registration invariant)', () => {
  it('surfaces a feature from any pillar that self-registers with a features slot', () => {
    registerPillar(
      baseManifest('alpha', [{ key: 'alpha.flag', label: 'Alpha', default: true, scope: 'system' }])
    );
    expect(isEnabled(db, 'alpha.flag')).toBe(true);
    const [feature] = listFeatures(db);
    expect(feature?.key).toBe('alpha.flag');
    expect(feature?.manifestId).toBe('alpha');
  });

  it('a newly registered pillar appears without any code change', () => {
    expect(listFeatures(db)).toHaveLength(0);
    registerPillar(
      baseManifest('beta', [{ key: 'beta.flag', label: 'Beta', default: false, scope: 'system' }])
    );
    expect(listFeatures(db).map((f) => f.key)).toEqual(['beta.flag']);
  });

  it('getFeatureManifests groups features under the declaring pillar', () => {
    registerPillar(
      baseManifest('alpha', [{ key: 'alpha.a', label: 'A', default: true, scope: 'system' }])
    );
    registerPillar(
      baseManifest('beta', [{ key: 'beta.b', label: 'B', default: true, scope: 'system' }])
    );
    const manifests = getFeatureManifests(db);
    expect(manifests.map((m) => m.id)).toEqual(['alpha', 'beta']);
    expect(manifests[0]?.features.map((f) => f.key)).toEqual(['alpha.a']);
  });
});

describe('isEnabled', () => {
  it('throws FeatureNotFoundError for unknown features (loud, not silent)', () => {
    expect(() => isEnabled(db, 'does.not.exist')).toThrow(FeatureNotFoundError);
  });

  it('FeatureNotFoundError lists searched pillar ids', () => {
    registerSimpleFeature();
    try {
      isEnabled(db, 'not-installed.feature');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(FeatureNotFoundError);
      const e = err as FeatureNotFoundError;
      expect(e.key).toBe('not-installed.feature');
      expect(e.searched).toContain('test');
      expect(e.message).toContain('not-installed.feature');
      expect(e.message).toContain('test');
    }
  });

  it('returns the feature default when no overrides', () => {
    registerSimpleFeature({ default: true });
    expect(isEnabled(db, 'test.simple')).toBe(true);
  });

  it('reads system override from settings', () => {
    registerSimpleFeature({ default: false });
    seedSetting('test.simple', 'true');
    expect(isEnabled(db, 'test.simple')).toBe(true);
  });

  it('uses settingKey when provided', () => {
    registerSimpleFeature({ default: false, settingKey: 'legacy.key' });
    seedSetting('legacy.key', 'true');
    expect(isEnabled(db, 'test.simple')).toBe(true);
  });

  it('returns false when a core-local capability probe returns false', () => {
    registerSimpleFeature({
      default: true,
      scope: 'capability',
      capability: { pillar: 'core', key: 'redis' },
    });
    expect(isEnabled(db, 'test.simple', {}, coreProbes('redis', false))).toBe(false);
  });

  it('returns true when a core-local capability probe returns true', () => {
    registerSimpleFeature({
      default: true,
      scope: 'capability',
      capability: { pillar: 'core', key: 'redis' },
    });
    expect(isEnabled(db, 'test.simple', {}, coreProbes('redis', true))).toBe(true);
  });

  it('treats a core capability with no wired probe as unavailable', () => {
    registerSimpleFeature({
      default: true,
      scope: 'capability',
      capability: { pillar: 'core', key: 'redis' },
    });
    expect(isEnabled(db, 'test.simple')).toBe(false);
  });

  it('treats a cross-pillar capability as unavailable (deferred to S3)', () => {
    registerPillar(
      baseManifest('cerebrum', [
        {
          key: 'cerebrum.vectorSearch',
          label: 'Vector search',
          default: true,
          scope: 'capability',
          capability: { pillar: 'cerebrum', key: 'vectorSearch' },
        },
      ])
    );
    expect(isEnabled(db, 'cerebrum.vectorSearch')).toBe(false);
    const [feature] = listFeatures(db);
    expect(feature?.state).toBe('unavailable');
    expect(feature?.capabilityMissing).toBe(true);
  });

  it('returns false when a required setting is missing', () => {
    registerSimpleFeature({ default: true, requires: ['cred.a', 'cred.b'] }, [
      settingsManifest([{ key: 'cred.a' }, { key: 'cred.b' }]),
    ]);
    seedSetting('cred.a', 'value');
    expect(isEnabled(db, 'test.simple')).toBe(false);
  });

  it('returns true when all required credentials are present', () => {
    registerSimpleFeature({ default: true, requires: ['cred.a', 'cred.b'] }, [
      settingsManifest([{ key: 'cred.a' }, { key: 'cred.b' }]),
    ]);
    seedSetting('cred.a', 'value');
    seedSetting('cred.b', 'value');
    expect(isEnabled(db, 'test.simple')).toBe(true);
  });

  it('falls back to envFallback for required settings', () => {
    registerSimpleFeature({ default: true, requires: ['cred.a'] }, [
      settingsManifest([{ key: 'cred.a', envFallback: 'CRED_A' }]),
    ]);
    vi.stubEnv('CRED_A', 'from-env');
    expect(isEnabled(db, 'test.simple')).toBe(true);
  });

  it('returns false when requiresEnv is missing', () => {
    registerSimpleFeature({ default: true, requiresEnv: ['SOME_ENV'] });
    expect(isEnabled(db, 'test.simple')).toBe(false);
  });

  it('returns true when requiresEnv is set', () => {
    registerSimpleFeature({ default: true, requiresEnv: ['SOME_ENV'] });
    vi.stubEnv('SOME_ENV', 'value');
    expect(isEnabled(db, 'test.simple')).toBe(true);
  });

  it('user override takes precedence over system value for user-scoped features', () => {
    registerSimpleFeature({ default: false, scope: 'user' });
    seedSetting('test.simple', 'true');
    userSettingsService.setUserSetting(db, 'alice@example.com', 'feature.test.simple', 'false');
    expect(isEnabled(db, 'test.simple', { user: { email: 'alice@example.com' } })).toBe(false);
  });

  it('falls back to system value when no user override exists', () => {
    registerSimpleFeature({ default: false, scope: 'user' });
    seedSetting('test.simple', 'true');
    expect(isEnabled(db, 'test.simple', { user: { email: 'alice@example.com' } })).toBe(true);
  });

  it('ignores user override for system-scoped features', () => {
    registerSimpleFeature({ default: false, scope: 'system' });
    seedSetting('test.simple', 'true');
    userSettingsService.setUserSetting(db, 'alice@example.com', 'feature.test.simple', 'false');
    expect(isEnabled(db, 'test.simple', { user: { email: 'alice@example.com' } })).toBe(true);
  });
});

describe('listFeatures', () => {
  it('exposes credential resolution per feature', () => {
    registerSimpleFeature({ requires: ['cred.a'] }, [
      settingsManifest([{ key: 'cred.a', envFallback: 'CRED_A' }]),
    ]);
    seedSetting('cred.a', 'from-db');
    const [feature] = listFeatures(db);
    expect(feature?.credentials).toEqual([{ key: 'cred.a', source: 'database' }]);
  });

  it('marks features unavailable when a core capability probe is missing', () => {
    registerSimpleFeature({
      default: true,
      scope: 'capability',
      capability: { pillar: 'core', key: 'redis' },
    });
    const [feature] = listFeatures(db, null, coreProbes('redis', false));
    expect(feature?.state).toBe('unavailable');
    expect(feature?.capabilityMissing).toBe(true);
    expect(feature?.enabled).toBe(false);
  });

  it('marks user override correctly', () => {
    registerSimpleFeature({ default: false, scope: 'user' });
    userSettingsService.setUserSetting(db, 'alice@example.com', 'feature.test.simple', 'true');
    const [feature] = listFeatures(db, { email: 'alice@example.com' });
    expect(feature?.userOverride).toBe(true);
    expect(feature?.enabled).toBe(true);
  });
});

describe('setFeatureEnabled', () => {
  it('throws FeatureNotFoundError for unknown features', () => {
    expect(() => setFeatureEnabled(db, 'nope', true)).toThrow(FeatureNotFoundError);
  });

  it('rejects capability-scoped features', () => {
    registerSimpleFeature({
      scope: 'capability',
      capability: { pillar: 'core', key: 'redis' },
    });
    expect(() => setFeatureEnabled(db, 'test.simple', true, coreProbes('redis', true))).toThrow(
      FeatureScopeError
    );
  });

  it('rejects when required credentials are missing', () => {
    registerSimpleFeature({ requires: ['cred.a'] }, [settingsManifest([{ key: 'cred.a' }])]);
    expect(() => setFeatureEnabled(db, 'test.simple', true)).toThrow(FeatureGateError);
  });

  it('persists the value via the underlying setting key', () => {
    registerSimpleFeature({ settingKey: 'legacy.flag' });
    expect(setFeatureEnabled(db, 'test.simple', true)).toBe(true);
    const row = coreDb.raw
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('legacy.flag') as { value: string } | undefined;
    expect(row?.value).toBe('true');
  });

  it('allows disabling a feature even when credentials are missing', () => {
    registerSimpleFeature({ requires: ['cred.a'] }, [settingsManifest([{ key: 'cred.a' }])]);
    expect(setFeatureEnabled(db, 'test.simple', false)).toBe(false);
  });
});

describe('setUserPreference / clearUserPreference', () => {
  it('rejects when feature is not user-scoped', () => {
    registerSimpleFeature({ scope: 'system' });
    expect(() => setUserPreference(db, 'test.simple', { email: 'a@b' }, true)).toThrow(
      FeatureScopeError
    );
  });

  it('writes per-user override and resolves to that value', () => {
    registerSimpleFeature({ scope: 'user', default: false });
    setUserPreference(db, 'test.simple', { email: 'a@b' }, true);
    expect(isEnabled(db, 'test.simple', { user: { email: 'a@b' } })).toBe(true);
  });

  it('clearUserPreference removes the override and falls back to system default', () => {
    registerSimpleFeature({ scope: 'user', default: true });
    setUserPreference(db, 'test.simple', { email: 'a@b' }, false);
    expect(isEnabled(db, 'test.simple', { user: { email: 'a@b' } })).toBe(false);
    expect(clearUserPreference(db, 'test.simple', { email: 'a@b' })).toBe(true);
    expect(isEnabled(db, 'test.simple', { user: { email: 'a@b' } })).toBe(true);
  });
});
