import { describe, expect, it } from 'vitest';

import { findModule, isModuleId, KNOWN_MODULES, MODULES } from './index.js';

import type { SettingsManifest } from '@pops/types';

describe('@pops/module-registry exports', () => {
  it('MODULES is non-empty after the registry build', () => {
    // Sanity check: the registry build is the prerequisite for any consumer
    // wiring. An empty array here means the canonical manifest source list
    // is empty or the build script silently produced no output.
    expect(MODULES.length).toBeGreaterThan(0);
  });

  it('every entry has a non-empty string id', () => {
    for (const m of MODULES) {
      expect(typeof m.id).toBe('string');
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  it('module ids are unique', () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('MODULES is sorted by id for deterministic output', () => {
    const ids = MODULES.map((m) => m.id);
    const sorted = ids.toSorted((a, b) => a.localeCompare(b, 'en'));
    expect(ids).toEqual(sorted);
  });

  it('KNOWN_MODULES matches the ids in MODULES', () => {
    expect([...KNOWN_MODULES]).toEqual(MODULES.map((m) => m.id));
  });

  it('every entry declares at least one surface', () => {
    for (const m of MODULES) {
      expect(m.surfaces.length).toBeGreaterThan(0);
      for (const s of m.surfaces) {
        expect(s === 'app' || s === 'overlay').toBe(true);
      }
    }
  });

  it('overlay metadata is present iff surfaces includes overlay', () => {
    for (const m of MODULES) {
      const includesOverlay = (m.surfaces as readonly string[]).includes('overlay');
      const overlayPresent = 'overlay' in m && m.overlay !== undefined;
      expect(overlayPresent).toBe(includesOverlay);
    }
  });

  it("exposes each module's settings slot inline (PRD-101 US-04 follow-up)", () => {
    // The settings slot is the live `SettingsManifest[]` declared by each
    // module. `MODULES.flatMap(m => m.settings ?? [])` is the documented
    // consumer surface for the settings page and credentials resolver.
    // The flatMap callback's return annotation widens each module's narrow
    // settings tuple back to the contract type — `satisfies readonly
    // SettingsManifest[]` in `generated.ts` guards structural compatibility
    // at codegen time, so this widening is purely a type ergonomics step.
    const aggregated = MODULES.flatMap((m): readonly SettingsManifest[] =>
      'settings' in m && m.settings !== undefined ? m.settings : []
    );
    const ids = aggregated.map((s) => s.id);
    expect(ids).toContain('finance');
    expect(ids).toContain('inventory');
    expect(ids).toContain('media.plex');
    expect(ids).toContain('media.arr');
    expect(ids).toContain('media.rotation');
    expect(ids).toContain('media.operational');
    expect(ids).toContain('cerebrum');
    expect(ids).toContain('ego');
    expect(ids).toContain('ai.config');
    expect(ids).toContain('core.operational');
    for (const m of aggregated) {
      expect(m.groups.length).toBeGreaterThan(0);
    }
  });

  it('core is always installed regardless of env restrictions', () => {
    // `core` is the platform shell — `POPS_APPS` gates optional modules only.
    // The registry must always include it so the settings page surfaces
    // `ai.config` / `core.operational` even on a minimal install.
    expect(MODULES.some((m) => m.id === 'core')).toBe(true);
  });
});

describe('findModule', () => {
  it('returns the entry for a known id', () => {
    const first = MODULES[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const found = findModule(first.id);
    expect(found).toBe(first);
  });

  it('returns undefined for an unknown id (string overload)', () => {
    expect(findModule('nope')).toBeUndefined();
  });
});

describe('isModuleId', () => {
  it('returns true for a known id', () => {
    const first = MODULES[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(isModuleId(first.id)).toBe(true);
  });

  it('returns false for an unknown id', () => {
    expect(isModuleId('definitely-not-a-module')).toBe(false);
  });
});
