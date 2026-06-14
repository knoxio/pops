/**
 * PRD-098/099 frontend module manifests — structural validation.
 *
 * PRD-243 US-04 migrated this test off the per-pillar named-import literal
 * (audit finding M7). The manifest set is now derived from
 * `installedFrontendManifests()` — the same registry-walk getter the
 * shell uses at boot — so adding a new in-repo pillar requires no edit
 * here.
 */
import { describe, expect, it } from 'vitest';

import { assertModuleManifest, type ModuleManifest } from '@pops/types';

import { installedFrontendManifests } from '../app/installed-modules';

type LabelledManifest = readonly [string, ModuleManifest];

function labelled(manifests: readonly ModuleManifest[]): LabelledManifest[] {
  return manifests.map((m) => [m.id, m] as const);
}

const allManifests: LabelledManifest[] = labelled(installedFrontendManifests());

const pageRoutedApps: LabelledManifest[] = allManifests.filter(
  ([, m]) => m.surfaces.includes('app') && Array.isArray(m.frontend?.routes)
);

const overlayModules: LabelledManifest[] = allManifests.filter(([, m]) =>
  m.surfaces.includes('overlay')
);

describe('PRD-098/099 frontend module manifests', () => {
  it('the registry walk surfaces at least one installed manifest', () => {
    expect(allManifests.length).toBeGreaterThan(0);
  });

  it('the registry walk surfaces at least one page-routed app', () => {
    expect(pageRoutedApps.length).toBeGreaterThan(0);
  });

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
