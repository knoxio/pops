import { describe, expect, it } from 'vitest';

import { manifest as aiManifest } from '@pops/app-ai';
import { manifest as cerebrumManifest } from '@pops/app-cerebrum';
import { manifest as financeManifest } from '@pops/app-finance';
import { manifest as inventoryManifest } from '@pops/app-inventory';
import { manifest as mediaManifest } from '@pops/app-media';
import { assertModuleManifest, type ModuleManifest } from '@pops/types';

const manifests: ReadonlyArray<readonly [string, ModuleManifest]> = [
  ['ai', aiManifest],
  ['cerebrum', cerebrumManifest],
  ['finance', financeManifest],
  ['inventory', inventoryManifest],
  ['media', mediaManifest],
];

describe('PRD-098 frontend module manifests', () => {
  it.each(manifests)('%s manifest is structurally valid', (label, m) => {
    expect(() => assertModuleManifest(m, label)).not.toThrow();
  });

  it.each(manifests)('%s manifest declares frontend routes', (label, m) => {
    expect(m.frontend, `${label} should declare frontend block`).toBeDefined();
    expect(m.frontend?.routes, `${label} should declare frontend.routes`).toBeDefined();
  });

  it('manifest ids are unique across frontend modules', () => {
    const ids = manifests.map(([, m]) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every frontend manifest id matches its label', () => {
    for (const [label, m] of manifests) {
      expect(m.id).toBe(label);
    }
  });
});
