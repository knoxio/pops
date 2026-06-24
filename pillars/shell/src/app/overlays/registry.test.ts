/**
 * Tests for the shell-level overlay registry
 * (docs/themes/foundation/prds/overlay-surfaces).
 *
 * The runtime export `installedOverlays` is the join of the live overlay
 * manifests and the runtime `INSTALLED_MODULES` install set (`POPS_APPS` /
 * `POPS_OVERLAYS` are re-evaluated at module load). The pure helper
 * `selectInstalledOverlays` is exposed so we can exercise both the
 * "installed" and "absent" branches without mocking the generated module
 * registry.
 */
import { describe, expect, it } from 'vitest';

import { manifest as egoManifest } from '@pops/overlay-ego';

import { installedOverlays, selectInstalledOverlays } from './registry';

describe('overlay registry — installedOverlays (runtime)', () => {
  it('mounts the ego overlay when ego is in the install set', () => {
    const egoEntry = installedOverlays.find((o) => o.moduleId === 'ego');
    expect(egoEntry).toBeDefined();
    expect(egoEntry?.chromeSlot).toBe('assistant');
    expect(egoEntry?.shortcut).toBe('mod+i');
    expect(typeof egoEntry?.loader).toBe('function');
  });
});

describe('overlay registry — selectInstalledOverlays (pure)', () => {
  it('returns the overlay when its module id is in the install set', () => {
    const out = selectInstalledOverlays([egoManifest], new Set(['ego']));
    expect(out).toHaveLength(1);
    expect(out[0]?.moduleId).toBe('ego');
  });

  it('returns an empty array when the install set excludes the overlay (POPS_OVERLAYS=)', () => {
    const out = selectInstalledOverlays([egoManifest], new Set<string>());
    expect(out).toEqual([]);
  });

  it('skips manifests that declare an overlay slot but no lazy component loader', () => {
    const out = selectInstalledOverlays(
      [
        {
          id: 'placeholder',
          name: 'Placeholder',
          surfaces: ['overlay'],
          frontend: { overlay: { chromeSlot: 'assistant' } },
        },
      ],
      new Set(['placeholder'])
    );
    expect(out).toEqual([]);
  });

  it("ignores manifests whose surfaces don't include overlay", () => {
    const out = selectInstalledOverlays(
      [{ id: 'finance', name: 'Finance', surfaces: ['app'] }],
      new Set(['finance'])
    );
    expect(out).toEqual([]);
  });
});
