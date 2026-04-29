import { describe, expect, it } from 'vitest';

import { FeaturesRegistry } from './registry.js';

import type { FeatureManifest } from '@pops/types';

function makeManifest(id: string, order: number, keys: string[]): FeatureManifest {
  return {
    id,
    title: id,
    order,
    features: keys.map((key) => ({
      key,
      label: key,
      default: false,
      scope: 'system',
    })),
  };
}

describe('FeaturesRegistry', () => {
  it('returns manifests sorted by order', () => {
    const registry = new FeaturesRegistry();
    registry.register(makeManifest('beta', 200, ['beta.x']));
    registry.register(makeManifest('alpha', 100, ['alpha.x']));
    expect(registry.getAll().map((m) => m.id)).toEqual(['alpha', 'beta']);
  });

  it('rejects duplicate manifest IDs', () => {
    const registry = new FeaturesRegistry();
    registry.register(makeManifest('alpha', 100, ['alpha.x']));
    expect(() => registry.register(makeManifest('alpha', 200, ['alpha.y']))).toThrow(
      /alpha.*already registered/
    );
  });

  it('rejects duplicate feature keys across manifests', () => {
    const registry = new FeaturesRegistry();
    registry.register(makeManifest('first', 100, ['shared.key', 'a']));
    expect(() => registry.register(makeManifest('second', 200, ['b', 'shared.key']))).toThrow(
      /(?=.*shared\.key)(?=.*first)(?=.*second)/
    );
  });

  it('rejects duplicate feature keys within a manifest', () => {
    const registry = new FeaturesRegistry();
    expect(() => registry.register(makeManifest('m', 1, ['x', 'x']))).toThrow(/more than once/);
  });

  it('getFeature returns the manifest + feature pair', () => {
    const registry = new FeaturesRegistry();
    const manifest = makeManifest('alpha', 100, ['alpha.x']);
    registry.register(manifest);
    const found = registry.getFeature('alpha.x');
    expect(found?.feature.key).toBe('alpha.x');
    expect(found?.manifest.id).toBe('alpha');
  });

  it('getFeature returns null for unknown keys', () => {
    const registry = new FeaturesRegistry();
    expect(registry.getFeature('nope')).toBeNull();
  });

  it('clear removes all manifests', () => {
    const registry = new FeaturesRegistry();
    registry.register(makeManifest('m', 1, ['x']));
    registry.clear();
    expect(registry.getAll()).toEqual([]);
  });
});
