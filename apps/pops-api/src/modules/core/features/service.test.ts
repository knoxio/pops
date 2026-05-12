import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedSetting, setupTestContext } from '../../../shared/test-utils.js';

// `credentials.ts` reads settings fields from `@pops/module-registry`'s
// build-time `MODULES` constant (PRD-101 US-04 follow-up). Tests inject
// synthetic settings manifests through a mocked registry; the mutable
// `mockModules` array (kept hoisted so the factory captures it) lets each
// test push manifests with `registerSettingsManifest()` and have
// `findSettingsField()` resolve them.
const { mockModules } = vi.hoisted(() => ({ mockModules: [] as { settings?: unknown }[] }));
vi.mock('@pops/module-registry', () => ({
  MODULES: mockModules,
}));

import {
  __resetInstalledManifestsOverride,
  __setInstalledManifestsOverride,
} from '../../installed-modules.js';
import {
  clearUserPreference,
  FeatureGateError,
  FeatureNotFoundError,
  FeatureScopeError,
  isEnabled,
  listFeatures,
  setFeatureEnabled,
  setUserPreference,
} from './service.js';
import { setUserSetting } from './user-settings.js';

import type { Database } from 'better-sqlite3';

import type { FeatureManifest, ModuleManifest, SettingsManifest } from '@pops/types';

const ctx = setupTestContext();
let db: Database;

/**
 * Test scaffolding state. Each `installFeature*` helper mutates this list
 * and re-applies it to the manifest override; `__resetInstalledManifestsOverride()`
 * in `afterEach` restores production behaviour.
 */
let installed: ModuleManifest[] = [];

function applyInstalled(): void {
  __setInstalledManifestsOverride(installed);
}

beforeEach(() => {
  ({ db } = ctx.setup());
  installed = [];
  applyInstalled();
  mockModules.length = 0;
});

afterEach(() => {
  __resetInstalledManifestsOverride();
  ctx.teardown();
  vi.unstubAllEnvs();
  mockModules.length = 0;
});

/**
 * Install a single test FeatureManifest under a synthetic module id.
 * Replaces the previous `featuresRegistry.register()` helper from the
 * pre-PRD-101-US-05 tests.
 */
function installFeatureManifest(manifest: FeatureManifest): void {
  installed.push({
    id: manifest.id,
    name: manifest.title,
    surfaces: ['app'],
    features: [manifest],
  });
  applyInstalled();
}

function registerSimpleFeature(overrides: Partial<FeatureManifest['features'][number]> = {}) {
  const manifest: FeatureManifest = {
    id: 'test',
    title: 'Test',
    order: 1,
    features: [
      {
        key: 'test.simple',
        label: 'Simple',
        default: false,
        scope: 'system',
        ...overrides,
      },
    ],
  };
  installFeatureManifest(manifest);
}

function registerSettingsManifest(fieldKeys: { key: string; envFallback?: string }[]) {
  const manifest: SettingsManifest = {
    id: 'test.settings',
    title: 'Test settings',
    order: 1,
    groups: [
      {
        id: 'g',
        title: 'g',
        fields: fieldKeys.map(({ key, envFallback }) => ({
          key,
          label: key,
          type: 'text' as const,
          ...(envFallback ? { envFallback } : {}),
        })),
      },
    ],
  };
  // `credentials.ts` reads from the mocked `MODULES` (see top-of-file
  // `vi.mock`). `installed`/`installedManifests` still drives the feature
  // aggregator path; both surfaces have to agree on what's installed.
  mockModules.push({ settings: [manifest] });
  installed.push({
    id: manifest.id,
    name: manifest.title,
    surfaces: ['app'],
    settings: [manifest],
  });
  applyInstalled();
}

describe('isEnabled', () => {
  it('throws FeatureNotFoundError for unknown features (loud, not silent)', () => {
    // PRD-101 US-05: unknown key is a deliberate breaking change from the
    // pre-existing silent-`false` behaviour. Hand-rolled registration could
    // drift; manifest-declared can't.
    expect(() => isEnabled('does.not.exist')).toThrow(FeatureNotFoundError);
  });

  it('FeatureNotFoundError lists searched module ids', () => {
    registerSimpleFeature();
    try {
      isEnabled('not-installed.feature');
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
    expect(isEnabled('test.simple')).toBe(true);
  });

  it('reads system override from settings', () => {
    registerSimpleFeature({ default: false });
    seedSetting(db, { key: 'test.simple', value: 'true' });
    expect(isEnabled('test.simple')).toBe(true);
  });

  it('uses settingKey when provided', () => {
    registerSimpleFeature({ default: false, settingKey: 'legacy_key' });
    seedSetting(db, { key: 'legacy_key', value: 'true' });
    expect(isEnabled('test.simple')).toBe(true);
  });

  it('returns false when capabilityCheck returns false', () => {
    registerSimpleFeature({ default: true, capabilityCheck: () => false });
    expect(isEnabled('test.simple')).toBe(false);
  });

  it('returns false when a required setting is missing', () => {
    registerSettingsManifest([{ key: 'cred.a' }, { key: 'cred.b' }]);
    registerSimpleFeature({ default: true, requires: ['cred.a', 'cred.b'] });
    seedSetting(db, { key: 'cred.a', value: 'value' });
    expect(isEnabled('test.simple')).toBe(false);
  });

  it('returns true when all required credentials are present', () => {
    registerSettingsManifest([{ key: 'cred.a' }, { key: 'cred.b' }]);
    registerSimpleFeature({ default: true, requires: ['cred.a', 'cred.b'] });
    seedSetting(db, { key: 'cred.a', value: 'value' });
    seedSetting(db, { key: 'cred.b', value: 'value' });
    expect(isEnabled('test.simple')).toBe(true);
  });

  it('falls back to envFallback for required settings', () => {
    registerSettingsManifest([{ key: 'cred.a', envFallback: 'CRED_A' }]);
    registerSimpleFeature({ default: true, requires: ['cred.a'] });
    vi.stubEnv('CRED_A', 'from-env');
    expect(isEnabled('test.simple')).toBe(true);
  });

  it('returns false when requiresEnv is missing', () => {
    registerSimpleFeature({ default: true, requiresEnv: ['SOME_ENV'] });
    expect(isEnabled('test.simple')).toBe(false);
  });

  it('returns true when requiresEnv is set', () => {
    registerSimpleFeature({ default: true, requiresEnv: ['SOME_ENV'] });
    vi.stubEnv('SOME_ENV', 'value');
    expect(isEnabled('test.simple')).toBe(true);
  });

  it('user override takes precedence over system value for user-scoped features', () => {
    registerSimpleFeature({ default: false, scope: 'user' });
    seedSetting(db, { key: 'test.simple', value: 'true' });
    setUserSetting('alice@example.com', 'feature.test.simple', 'false');
    expect(isEnabled('test.simple', { user: { email: 'alice@example.com' } })).toBe(false);
  });

  it('falls back to system value when no user override exists', () => {
    registerSimpleFeature({ default: false, scope: 'user' });
    seedSetting(db, { key: 'test.simple', value: 'true' });
    expect(isEnabled('test.simple', { user: { email: 'alice@example.com' } })).toBe(true);
  });

  it('ignores user override for system-scoped features', () => {
    registerSimpleFeature({ default: false, scope: 'system' });
    seedSetting(db, { key: 'test.simple', value: 'true' });
    setUserSetting('alice@example.com', 'feature.test.simple', 'false');
    expect(isEnabled('test.simple', { user: { email: 'alice@example.com' } })).toBe(true);
  });
});

describe('listFeatures', () => {
  it('exposes credential resolution per feature', () => {
    registerSettingsManifest([{ key: 'cred.a', envFallback: 'CRED_A' }]);
    registerSimpleFeature({ requires: ['cred.a'] });
    seedSetting(db, { key: 'cred.a', value: 'from-db' });
    const [feature] = listFeatures();
    expect(feature?.credentials).toEqual([{ key: 'cred.a', source: 'database' }]);
  });

  it('marks features unavailable when capability is missing', () => {
    registerSimpleFeature({ default: true, capabilityCheck: () => false });
    const [feature] = listFeatures();
    expect(feature?.state).toBe('unavailable');
    expect(feature?.capabilityMissing).toBe(true);
    expect(feature?.enabled).toBe(false);
  });

  it('marks user override correctly', () => {
    registerSimpleFeature({ default: false, scope: 'user' });
    setUserSetting('alice@example.com', 'feature.test.simple', 'true');
    const [feature] = listFeatures({ email: 'alice@example.com' });
    expect(feature?.userOverride).toBe(true);
    expect(feature?.enabled).toBe(true);
  });
});

describe('setFeatureEnabled', () => {
  it('throws FeatureNotFoundError for unknown features', () => {
    expect(() => setFeatureEnabled('nope', true)).toThrow(FeatureNotFoundError);
  });

  it('rejects capability-scoped features', () => {
    registerSimpleFeature({ scope: 'capability', capabilityCheck: () => true });
    expect(() => setFeatureEnabled('test.simple', true)).toThrow(FeatureScopeError);
  });

  it('rejects when required credentials are missing', () => {
    registerSettingsManifest([{ key: 'cred.a' }]);
    registerSimpleFeature({ requires: ['cred.a'] });
    expect(() => setFeatureEnabled('test.simple', true)).toThrow(FeatureGateError);
  });

  it('rejects when capability check fails on enable', () => {
    registerSimpleFeature({ scope: 'system', capabilityCheck: () => false });
    expect(() => setFeatureEnabled('test.simple', true)).toThrow(FeatureGateError);
  });

  it('persists the value via the underlying setting key', () => {
    registerSimpleFeature({ settingKey: 'legacy_flag' });
    expect(setFeatureEnabled('test.simple', true)).toBe(true);
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('legacy_flag') as {
      value: string;
    };
    expect(row.value).toBe('true');
  });

  it('allows disabling a feature even when credentials are missing', () => {
    registerSettingsManifest([{ key: 'cred.a' }]);
    registerSimpleFeature({ requires: ['cred.a'] });
    expect(setFeatureEnabled('test.simple', false)).toBe(false);
  });
});

describe('setUserPreference / clearUserPreference', () => {
  it('rejects when feature is not user-scoped', () => {
    registerSimpleFeature({ scope: 'system' });
    expect(() => setUserPreference('test.simple', { email: 'a@b' }, true)).toThrow(
      FeatureScopeError
    );
  });

  it('writes per-user override and resolves to that value', () => {
    registerSimpleFeature({ scope: 'user', default: false });
    setUserPreference('test.simple', { email: 'a@b' }, true);
    expect(isEnabled('test.simple', { user: { email: 'a@b' } })).toBe(true);
  });

  it('clearUserPreference removes the override and falls back to system default', () => {
    registerSimpleFeature({ scope: 'user', default: true });
    setUserPreference('test.simple', { email: 'a@b' }, false);
    expect(isEnabled('test.simple', { user: { email: 'a@b' } })).toBe(false);
    expect(clearUserPreference('test.simple', { email: 'a@b' })).toBe(true);
    expect(isEnabled('test.simple', { user: { email: 'a@b' } })).toBe(true);
  });
});
