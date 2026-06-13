import { describe, expect, it } from 'vitest';

import {
  aiConfigManifest,
  arrManifest,
  cerebrumManifest,
  coreOperationalManifest,
  egoManifest,
  financeManifest,
  inventoryManifest,
  mediaOperationalManifest,
  plexManifest,
  rotationManifest,
} from '../index.js';

describe('@pops/pillar-sdk/settings re-export surface', () => {
  it('exposes all ten pillar settings manifests', () => {
    const manifests = {
      aiConfigManifest,
      coreOperationalManifest,
      inventoryManifest,
      financeManifest,
      cerebrumManifest,
      egoManifest,
      arrManifest,
      plexManifest,
      rotationManifest,
      mediaOperationalManifest,
    };

    for (const [name, manifest] of Object.entries(manifests)) {
      expect(manifest, `${name} is reachable`).toBeDefined();
      expect(manifest, `${name} is non-null`).not.toBeNull();
      expect(typeof manifest.id, `${name}.id is a string`).toBe('string');
    }
  });
});
