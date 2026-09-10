/**
 * Online-path render test for the registry-driven boot branch.
 *
 * The Playwright suite that does exercise this branch is gated
 * (workflow_dispatch only), and it drives the shell through `page.route`
 * stubs rather than the browser's own fetch — so a regression in the fetch,
 * parse or resolve layer surfaces there as "no pillars", if the gated suite
 * is run at all.
 *
 * This drives the real online pipeline end-to-end in jsdom: a stubbed `fetch`
 * serves a NON-EMPTY snapshot (two loader-mounted pillars) →
 * `fetchBootRegistry()` resolves it (NOT a fixture, the production resolver) →
 * the result seeds `BootRegistryProvider` → a rail consumer reading
 * `useRegisteredApps()` renders the live install set. The assertion is the
 * 2(a) non-blank guarantee at the render layer: `source === 'registry'` and
 * the rendered rail carries the snapshot's apps.
 *
 * It deliberately renders a minimal rail probe rather than the full `AppRail`
 * so the test pins the boot→fetch→render contract without coupling to i18n,
 * the UI store, or the tooltip/icon stack (which the rail's own concerns own).
 */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { fetchBootRegistry } from './boot-snapshot';
import { BootRegistryProvider, useRegisteredApps } from './BootRegistryProvider';

import type { ManifestPayload } from '@pops/pillar-sdk';

import type { BootRegistry } from './boot-snapshot';

function manifestPayload(pillar: string, extra: Partial<ManifestPayload> = {}): ManifestPayload {
  return {
    pillar,
    version: '1.0.0',
    contract: { package: `@pops/${pillar}`, version: '1.0.0', tag: `contract-${pillar}@v1.0.0` },
    routes: { queries: [], mutations: [], subscriptions: [] },
    search: { adapters: [] },
    ai: { tools: [] },
    uri: { types: [] },
    consumedSettings: { keys: [] },
    healthcheck: { path: '/health' },
    ...extra,
  };
}

/**
 * One raw `GET /registry-api/registry/pillars` row, in the wire shape the
 * fetcher normalises (`lastHeartbeatAt`, not `lastSeenAt`). Building the wire
 * row — not a `PillarSnapshot` — keeps the fetch+parse layer in the loop.
 */
function wireEntry(pillarId: string, manifestExtra: Partial<ManifestPayload> = {}) {
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3001`,
    manifest: manifestPayload(pillarId, manifestExtra),
    lastHeartbeatAt: new Date(0).toISOString(),
  };
}

// Icons MUST be kebab-case on the wire (NavConfigDescriptorSchema): the wire
// parse this test exercises rejects PascalCase, so the fixture uses `compass`.
const EXTERNAL_WIRE = wireEntry('weather', {
  assetsBaseUrl: 'https://cdn.example.com/weather/index.js',
  nav: {
    id: 'weather',
    label: 'Weather',
    labelKey: 'weather',
    icon: 'compass',
    basePath: '/weather',
    order: 35,
    items: [{ path: '', label: 'Home', labelKey: 'weather.home', icon: 'compass' }],
  },
  pages: [{ path: '', index: true, bundleSlot: 'home' }],
});

function snapshotResponse(pillars: readonly unknown[]): Response {
  return new Response(JSON.stringify({ pillars }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Minimal rail consumer: renders the live install set the rail would mount. */
function RailProbe() {
  const apps = useRegisteredApps();
  return (
    <ul aria-label="rail">
      {apps.map((app) => (
        <li key={app.id} data-testid={`rail-${app.id}`}>
          {app.id}
        </li>
      ))}
    </ul>
  );
}

function renderRail(bootRegistry: BootRegistry): void {
  render(
    <BootRegistryProvider value={bootRegistry}>
      <RailProbe />
    </BootRegistryProvider>
  );
}

/**
 * The wire UI dimensions an in-repo pillar publishes since POPS-3215.
 *
 * They used to be unnecessary here: `media` was in the shell's bundle map, so
 * a snapshot entry with no UI surface still reached the rail. Every pillar has
 * left that map, so a fixture without these resolves to nothing.
 */
function inRepoUi(pillar: string, order: number): Partial<ManifestPayload> {
  return {
    assetsBaseUrl: `/${pillar}-ui/${pillar}.js`,
    nav: {
      id: pillar,
      label: pillar,
      labelKey: pillar,
      icon: 'compass',
      basePath: `/${pillar}`,
      order,
      items: [{ path: '', label: pillar, labelKey: `${pillar}.home`, icon: 'compass' }],
    },
    pages: [{ path: '', index: true, bundleSlot: `${pillar}-home` }],
  };
}

describe('shell online boot → render (registry-driven branch)', () => {
  it('fetches a non-empty snapshot and renders the registry-driven rail (not the floor)', async () => {
    const fetchStub = vi.fn(() =>
      Promise.resolve(snapshotResponse([wireEntry('media', inRepoUi('media', 20)), EXTERNAL_WIRE]))
    );

    // The exact production await `main.tsx` blocks first render on: fetch +
    // parse + resolve, no fixture shortcut. The external pillar's nav is
    // synthesized synchronously here; its remote bundle import() is lazy and
    // only fires on first navigation into its route — which the rail probe
    // never renders — so no network is touched.
    const bootRegistry = await fetchBootRegistry({ fetch: fetchStub });
    expect(bootRegistry.source).toBe('registry');

    renderRail(bootRegistry);

    // The rail is non-blank and carries the snapshot's apps — the live mount.
    const rail = await screen.findByRole('list', { name: 'rail' });
    expect(rail).toBeInTheDocument();
    expect(screen.getByTestId('rail-media')).toBeInTheDocument();
    expect(screen.getByTestId('rail-weather')).toBeInTheDocument();
    // Wire nav.order keeps the rail ordered (media=20 in-repo < weather=35).
    const ids = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(ids.indexOf('media')).toBeLessThan(ids.indexOf('weather'));
  });

  /**
   * An explicitly empty store, because since POPS-3239 the floor is the last
   * good snapshot when there is one. Left ambient this would read whatever the
   * test above cached — a floor nobody chose, and one that happens to contain
   * the external pillar this asserts is absent.
   */
  function noCache() {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_k: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    };
  }

  /**
   * This asserted "even on a dead registry the rendered rail is the full
   * mapped floor". POPS-3215 emptied that map, so the floor has nothing left
   * to render and the honest assertion is the inverse.
   *
   * That is not a regression being written down — it is the trade the epic
   * makes, and the reason POPS-3239 exists: the fallback is now the last good
   * snapshot, exercised by the test below. What remains true, and is what this
   * still guards, is that boot RESOLVES rather than throwing — a dead registry
   * with no cache yields an empty rail and a shell that still renders its own
   * chrome, not a crash or a blank document. POPS-3250 covers the reader-facing
   * half: those routes currently say "Module not installed".
   */
  it('resolves to an empty surface, without crashing, when the fetch fails and no cache exists', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const bootRegistry = await fetchBootRegistry({ fetch: fetchStub, store: noCache() });
    expect(bootRegistry.source).toBe('empty');

    renderRail(bootRegistry);

    const rail = await screen.findByRole('list', { name: 'rail' });
    expect(rail).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  /**
   * The floor the shell actually has now that POPS-3215 and POPS-3227 have
   * emptied and then removed the bundle map: the set that answered last time,
   * rendered.
   *
   * `weather` is the point. It is an external pillar with no bundle-map entry,
   * and there is no static floor left to produce it — its presence on the
   * rail after a dead fetch is proof the cache drove the boot, not a map.
   */
  it('renders the last good snapshot when the registry has gone away', async () => {
    const store = noCache();
    const goodFetch = vi.fn(() =>
      Promise.resolve(snapshotResponse([wireEntry('media', inRepoUi('media', 20)), EXTERNAL_WIRE]))
    );
    const first = await fetchBootRegistry({ fetch: goodFetch, store });
    expect(first.source).toBe('registry');

    const deadFetch = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const offline = await fetchBootRegistry({ fetch: deadFetch, store });
    expect(offline.source).toBe('cached-snapshot');

    renderRail(offline);

    await waitFor(() => expect(screen.getByTestId('rail-media')).toBeInTheDocument());
    expect(screen.getByTestId('rail-weather')).toBeInTheDocument();
  });
});
