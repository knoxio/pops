/**
 * Unit tests for the feature-toggle key-ownership invariant
 * (settings-federation S1, R10).
 */
import { describe, expect, it } from 'vitest';

import { assertFeatureKeysAreCoreOwned, FeatureKeyOwnershipError } from '../key-ownership.js';

import type { FeatureManifestDescriptor } from '@pops/pillar-sdk';
import type { KeyDefaults } from '@pops/pillar-settings';

const coreKeyDefaults: KeyDefaults = {
  keys: ['core.redis', 'core.queue.syncConcurrency', 'theme'],
  defaults: {},
  sensitive: [],
};

function feature(overrides: Partial<FeatureManifestDescriptor>): FeatureManifestDescriptor {
  return {
    key: 'core.redis',
    label: 'Redis',
    default: true,
    scope: 'system',
    ...overrides,
  };
}

describe('assertFeatureKeysAreCoreOwned', () => {
  it('passes when every system-scoped feature key is core-owned', () => {
    expect(() =>
      assertFeatureKeysAreCoreOwned(
        [feature({ key: 'core.redis' }), feature({ key: 'core.queue.syncConcurrency' })],
        coreKeyDefaults
      )
    ).not.toThrow();
  });

  it('honours settingKey over key when resolving the storage key', () => {
    expect(() =>
      assertFeatureKeysAreCoreOwned(
        [feature({ key: 'core.redis', settingKey: 'core.queue.syncConcurrency' })],
        coreKeyDefaults
      )
    ).not.toThrow();
  });

  it('throws when a system-scoped feature names a non-core key', () => {
    expect(() =>
      assertFeatureKeysAreCoreOwned(
        [feature({ key: 'core.redis', settingKey: 'finance.aiCategorizer.model' })],
        coreKeyDefaults
      )
    ).toThrow(FeatureKeyOwnershipError);
  });

  it('reports every offending feature in the error', () => {
    try {
      assertFeatureKeysAreCoreOwned(
        [
          feature({ key: 'core.redis', settingKey: 'finance.x' }),
          feature({ key: 'core.queue.syncConcurrency', settingKey: 'media.y' }),
        ],
        coreKeyDefaults
      );
      throw new Error('expected FeatureKeyOwnershipError');
    } catch (err) {
      expect(err).toBeInstanceOf(FeatureKeyOwnershipError);
      const offending = (err as FeatureKeyOwnershipError).offending;
      expect(offending.map((o) => o.settingKey)).toEqual(['finance.x', 'media.y']);
    }
  });

  it('exempts user-scoped and capability-scoped features', () => {
    expect(() =>
      assertFeatureKeysAreCoreOwned(
        [
          feature({ scope: 'user', settingKey: 'finance.not.core' }),
          feature({ scope: 'capability', settingKey: 'media.not.core' }),
        ],
        coreKeyDefaults
      )
    ).not.toThrow();
  });
});
