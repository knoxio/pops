import { describe, expect, it } from 'vitest';

import { cerebrumManifest, egoManifest } from '../settings/index.js';

describe('cerebrum-contract settings manifests', () => {
  it('exposes cerebrumManifest with id "cerebrum"', () => {
    expect(cerebrumManifest.id).toBe('cerebrum');
    expect(cerebrumManifest.groups.length).toBeGreaterThan(0);
  });

  it('exposes egoManifest with id "ego"', () => {
    expect(egoManifest.id).toBe('ego');
    expect(egoManifest.groups.length).toBeGreaterThan(0);
  });
});
