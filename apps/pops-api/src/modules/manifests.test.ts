import { describe, expect, it } from 'vitest';

import { assertModuleManifest, type ModuleManifest } from '@pops/types';

import { manifest as cerebrumManifest } from './cerebrum/index.js';
import { manifest as coreManifest } from './core/index.js';
import { manifest as egoManifest } from './ego/index.js';
import { manifest as financeManifest } from './finance/index.js';
import { manifest as inventoryManifest } from './inventory/index.js';
import { manifest as mediaManifest } from './media/index.js';

const manifests: ReadonlyArray<readonly [string, ModuleManifest]> = [
  ['core', coreManifest],
  ['finance', financeManifest],
  ['inventory', inventoryManifest],
  ['media', mediaManifest],
  ['ego', egoManifest],
  ['cerebrum', cerebrumManifest],
];

describe('PRD-098 backend module manifests', () => {
  it.each(manifests)('%s manifest is structurally valid', (label, m) => {
    expect(() => assertModuleManifest(m, label)).not.toThrow();
  });

  it.each(manifests)('%s manifest declares a backend router', (label, m) => {
    expect(m.backend, `${label} should declare backend.router`).toBeDefined();
    expect(m.backend?.router).toBeDefined();
  });

  it('manifest ids are unique across backend modules', () => {
    const ids = manifests.map(([, m]) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every backend manifest id matches its label', () => {
    for (const [label, m] of manifests) {
      expect(m.id).toBe(label);
    }
  });
});
