/**
 * PRD-101 US-03: shell-side aggregator that joins the build-time
 * `MODULES` install set to the live `@pops/app-*` / `@pops/overlay-*`
 * frontend manifests.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetInstalledFrontendManifestsOverride,
  __setInstalledFrontendManifestsOverride,
  hasRoutes,
  installedAppManifests,
  installedFrontendManifests,
  type FrontendManifest,
} from './installed-modules';

const SYNTHETIC_FINANCE: FrontendManifest = {
  id: 'finance',
  name: 'Finance (test)',
  surfaces: ['app'],
  frontend: {
    routes: [{ index: true, element: null }],
  },
};

const SYNTHETIC_INVENTORY_NO_ROUTES: FrontendManifest = {
  id: 'inventory',
  name: 'Inventory (test, no routes)',
  surfaces: ['app'],
};

const SYNTHETIC_EGO_OVERLAY: FrontendManifest = {
  id: 'ego',
  name: 'Ego (test, overlay-only)',
  surfaces: ['overlay'],
  frontend: {
    overlay: { chromeSlot: 'assistant' },
  },
};

describe('installedAppManifests (PRD-101 US-03)', () => {
  afterEach(() => {
    __resetInstalledFrontendManifestsOverride();
  });

  it('returns every installed manifest that declares both app surface and frontend.routes', () => {
    __setInstalledFrontendManifestsOverride([
      SYNTHETIC_FINANCE,
      SYNTHETIC_INVENTORY_NO_ROUTES,
      SYNTHETIC_EGO_OVERLAY,
    ]);
    const ids = installedAppManifests().map((m) => m.id);
    // Inventory is excluded — declares 'app' surface but no routes.
    // Ego is excluded — declares 'overlay' surface only.
    expect(ids).toEqual(['finance']);
  });

  it('excludes overlay-only surfaces from the app route table', () => {
    __setInstalledFrontendManifestsOverride([SYNTHETIC_EGO_OVERLAY]);
    expect(installedAppManifests()).toEqual([]);
  });

  it('returns an empty list when no manifests are installed', () => {
    __setInstalledFrontendManifestsOverride([]);
    expect(installedAppManifests()).toEqual([]);
  });

  it('production path reads from MODULES (build-time registry)', () => {
    // No override applied — `installedFrontendManifests` should pick up
    // every manifest that the committed `MODULES` registry installs.
    // The committed `generated.ts` installs every known module, so the
    // list must be non-empty and every entry must satisfy the
    // frontend-manifest contract (`surfaces` declared).
    const live = installedFrontendManifests();
    expect(live.length).toBeGreaterThan(0);
    for (const m of live) {
      expect(typeof m.id).toBe('string');
      expect(Array.isArray(m.surfaces)).toBe(true);
    }
  });
});

describe('hasRoutes type guard', () => {
  it('narrows manifests with array routes', () => {
    expect(hasRoutes(SYNTHETIC_FINANCE)).toBe(true);
  });

  it('rejects manifests with no frontend block', () => {
    expect(hasRoutes(SYNTHETIC_INVENTORY_NO_ROUTES)).toBe(false);
  });

  it('rejects overlay-only manifests', () => {
    expect(hasRoutes(SYNTHETIC_EGO_OVERLAY)).toBe(false);
  });
});
