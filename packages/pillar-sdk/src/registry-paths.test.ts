import { describe, expect, it } from 'vitest';

import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS } from './registry-paths.js';

describe('registry path maps', () => {
  it('exposes the same operation keys in both maps', () => {
    expect(Object.keys(REGISTRY_PATHS).toSorted()).toEqual(
      Object.keys(LEGACY_REGISTRY_PATHS).toSorted()
    );
  });

  it('maps every operation to the canonical slash form', () => {
    expect(REGISTRY_PATHS).toEqual({
      register: '/registry/register',
      heartbeat: '/registry/heartbeat',
      deregister: '/registry/deregister',
      snapshot: '/registry/pillars',
    });
  });

  it('maps every operation to the legacy dotted form', () => {
    expect(LEGACY_REGISTRY_PATHS).toEqual({
      register: '/core.registry.register',
      heartbeat: '/core.registry.heartbeat',
      deregister: '/core.registry.deregister',
      snapshot: '/core.registry.list',
    });
  });

  it('starts every canonical path with the /registry/ namespace', () => {
    for (const path of Object.values(REGISTRY_PATHS)) {
      expect(path.startsWith('/registry/')).toBe(true);
    }
  });

  it('uses dotted, non-/registry/ literals for every legacy path', () => {
    for (const path of Object.values(LEGACY_REGISTRY_PATHS)) {
      expect(path.startsWith('/core.registry.')).toBe(true);
      expect(path.startsWith('/registry/')).toBe(false);
    }
  });

  it('keeps the two maps disjoint so a candidate list never repeats a path', () => {
    const canonical = new Set<string>(Object.values(REGISTRY_PATHS));
    for (const legacy of Object.values(LEGACY_REGISTRY_PATHS)) {
      expect(canonical.has(legacy)).toBe(false);
    }
  });
});
