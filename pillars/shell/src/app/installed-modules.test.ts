/**
 * Shell-side install-set aggregator.
 *
 * The install set has no build-time source: `bootEntries()` maps a registry
 * snapshot onto registry entries and `filterAppManifests()` narrows those to
 * the ones the router can mount. The live set is resolved by the async boot
 * path (see `boot-snapshot.test.ts`).
 */
import { describe, expect, it } from 'vitest';

import {
  bootEntries,
  filterAppManifests,
  hasRoutes,
  type FrontendManifest,
} from './installed-modules';

import type { ManifestPayload, PillarSnapshot } from '@pops/pillar-sdk';

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

/**
 * Minimal manifest payload satisfying `ManifestPayloadSchema`'s required
 * fields. Tests spread `extra` to add the surface (`assetsBaseUrl` / `nav` /
 * `pages`) the entry under test exercises.
 */
function manifestPayload(pillar: string, extra: Partial<ManifestPayload> = {}): ManifestPayload {
  return {
    pillar,
    version: '1.0.0',
    contract: { package: `@pops/${pillar}`, version: '1.0.0', tag: `contract-${pillar}@v1.0.0` },
    routes: [],
    search: { enabled: false },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: [],
    healthcheck: { path: '/health' },
    ...extra,
  } as ManifestPayload;
}

function snapshotEntry(
  pillarId: string,
  options: { registered?: boolean; manifest?: Partial<ManifestPayload> } = {}
): PillarSnapshot {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3001`,
    manifest: manifestPayload(pillarId, options.manifest),
    registered: options.registered ?? true,
    lastSeenAt: new Date(0),
  };
}

describe('bootEntries — the non-page surfaces (POPS-3266)', () => {
  const OVERLAY = { bundleSlot: 'quick-add', order: 10, labelKey: 'acme.capture' } as const;

  /**
   * `bootEntries` is where a wire manifest becomes a `RegistryEntry`, and it
   * is the exact step that dropped the overlay: the synthesizer downstream
   * read `descriptor.captureOverlay` and nothing upstream ever set it. A
   * pillar could publish a perfectly good overlay and the capture modal would
   * report "no capture overlay registered".
   */
  it('copies captureOverlay off the wire manifest', () => {
    const [entry] = bootEntries([snapshotEntry('acme', { manifest: { captureOverlay: OVERLAY } })]);
    expect(entry?.captureOverlay).toEqual(OVERLAY);
  });

  it('leaves captureOverlay undefined when the manifest declares none', () => {
    const [entry] = bootEntries([snapshotEntry('acme')]);
    expect(entry?.captureOverlay).toBeUndefined();
  });

  /**
   * Widget slots are derived from the settings groups rather than carried as
   * their own wire field, so this asserts the derivation: a group with a
   * `widget.bundleSlot` contributes one, a plain group contributes nothing.
   */
  it('derives settings-widget slots from the published settings groups', () => {
    const [entry] = bootEntries([
      snapshotEntry('acme', {
        manifest: {
          settings: {
            manifests: [
              {
                id: 'acme.plex',
                title: 'Plex',
                order: 10,
                groups: [
                  {
                    id: 'account',
                    title: 'Account',
                    widget: { bundleSlot: 'plex-connect' },
                    fields: [],
                  },
                  { id: 'plain', title: 'Plain', fields: [] },
                ],
              },
            ],
          },
        },
      }),
    ]);
    expect(entry?.settingsWidgetSlots).toEqual(['plex-connect']);
  });

  it('leaves settings-widget slots undefined when no group names one', () => {
    const [entry] = bootEntries([snapshotEntry('acme')]);
    expect(entry?.settingsWidgetSlots).toBeUndefined();
  });
});

describe('bootEntries (P7-T03 snapshot → registry entries)', () => {
  it('maps registered snapshot entries onto registry entries', () => {
    const entries = bootEntries([snapshotEntry('finance'), snapshotEntry('media')]);
    expect(entries.map((e) => e.pillarId)).toEqual(['finance', 'media']);
  });

  it('drops entries that are not registered', () => {
    const entries = bootEntries([
      snapshotEntry('finance'),
      snapshotEntry('media', { registered: false }),
    ]);
    expect(entries.map((e) => e.pillarId)).toEqual(['finance']);
  });

  it('threads an external pillar surface (assetsBaseUrl / nav / pages) off the manifest', () => {
    const nav = {
      id: 'weather',
      label: 'Weather',
      labelKey: 'weather',
      icon: 'Compass',
      basePath: '/weather',
      order: 80,
      items: [{ path: '', label: 'Home', labelKey: 'weather.home', icon: 'Compass' }],
    };
    const pages = [{ path: '', index: true, bundleSlot: 'home' }];
    const [entry] = bootEntries([
      snapshotEntry('weather', {
        manifest: {
          assetsBaseUrl: 'https://cdn.example.com/weather/index.js',
          nav,
          pages,
        },
      }),
    ]);
    expect(entry?.assetsBaseUrl).toBe('https://cdn.example.com/weather/index.js');
    expect(entry?.nav).toEqual(nav);
    expect(entry?.pages).toEqual(pages);
  });

  it('omits the external-UI fields for an in-repo (no assetsBaseUrl) pillar', () => {
    const [entry] = bootEntries([snapshotEntry('finance')]);
    expect(entry?.pillarId).toBe('finance');
    expect(entry?.assetsBaseUrl).toBeUndefined();
    expect(entry?.nav).toBeUndefined();
    expect(entry?.pages).toBeUndefined();
  });
});

describe('filterAppManifests', () => {
  it('keeps app-surfaced, route-bearing manifests and drops the rest', () => {
    const ids = filterAppManifests([
      SYNTHETIC_FINANCE,
      SYNTHETIC_INVENTORY_NO_ROUTES,
      SYNTHETIC_EGO_OVERLAY,
    ]).map((m) => m.id);
    expect(ids).toEqual(['finance']);
  });

  it('drops an app-surfaced manifest that declares no routes', () => {
    expect(filterAppManifests([SYNTHETIC_INVENTORY_NO_ROUTES])).toEqual([]);
  });

  it('drops overlay-only surfaces from the app route table', () => {
    expect(filterAppManifests([SYNTHETIC_EGO_OVERLAY])).toEqual([]);
  });

  it('returns an empty list when nothing is installed', () => {
    expect(filterAppManifests([])).toEqual([]);
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
