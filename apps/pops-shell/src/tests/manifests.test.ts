import { describe, expect, it } from 'vitest';

import { manifest as aiManifest } from '@pops/app-ai';
import { manifest as cerebrumManifest } from '@pops/app-cerebrum';
import { manifest as financeManifest } from '@pops/app-finance';
import { manifest as inventoryManifest } from '@pops/app-inventory';
import { manifest as mediaManifest } from '@pops/app-media';
import { manifest as egoManifest } from '@pops/overlay-ego';
import { assertModuleManifest, type ModuleManifest } from '@pops/types';

const pageRoutedApps: ReadonlyArray<readonly [string, ModuleManifest]> = [
  ['ai', aiManifest],
  ['cerebrum', cerebrumManifest],
  ['finance', financeManifest],
  ['inventory', inventoryManifest],
  ['media', mediaManifest],
];

const overlayModules: ReadonlyArray<readonly [string, ModuleManifest]> = [['ego', egoManifest]];

const allManifests = [...pageRoutedApps, ...overlayModules];

describe('PRD-098/099 frontend module manifests', () => {
  it.each(allManifests)('%s manifest is structurally valid', (label, m) => {
    expect(() => assertModuleManifest(m, label)).not.toThrow();
  });

  it.each(pageRoutedApps)('%s manifest declares frontend routes', (label, m) => {
    expect(m.frontend, `${label} should declare frontend block`).toBeDefined();
    expect(m.frontend?.routes, `${label} should declare frontend.routes`).toBeDefined();
  });

  it.each(overlayModules)('%s overlay manifest declares overlay config', (label, m) => {
    expect(m.surfaces).toContain('overlay');
    expect(m.frontend?.overlay?.chromeSlot).toBeTypeOf('string');
  });

  it('manifest ids are unique across frontend modules', () => {
    const ids = allManifests.map(([, m]) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every frontend manifest id matches its label', () => {
    for (const [label, m] of allManifests) {
      expect(m.id).toBe(label);
    }
  });
});
