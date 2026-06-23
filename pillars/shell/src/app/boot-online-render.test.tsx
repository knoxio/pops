/**
 * Online-path render test (P7-T03 / RD-3, MUST-FIX 2).
 *
 * The registry-driven boot branch is this PR's entire purpose, yet it had no
 * rendered coverage: the gated Playwright suite (workflow_dispatch only — it
 * targets the deleted tRPC monolith) never runs in PR CI, and even when it
 * did, dev Vite had no `/registry-api` proxy and the e2e harness swaps a
 * build-time `@pops/module-registry` snapshot, so the boot fetch 404s and the
 * shell silently soft-falls to `[]` → the static floor. Every e2e therefore
 * exercises ONLY the floor; a regression that breaks only the live mount would
 * pass all CI green and surface only in production.
 *
 * This drives the real online pipeline end-to-end in jsdom: a stubbed `fetch`
 * serves a NON-EMPTY snapshot (one in-repo pillar + one external pillar) →
 * `fetchBootRegistry()` resolves it (NOT a fixture, the production resolver) →
 * the result seeds `BootRegistryProvider` → a rail consumer reading
 * `useRegisteredApps()` renders the live install set. The assertion is the
 * 2(a) non-blank guarantee at the render layer: `source === 'registry'` and
 * the rendered rail carries the snapshot's apps, never the floor.
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

describe('shell online boot → render (registry-driven branch)', () => {
  it('fetches a non-empty snapshot and renders the registry-driven rail (not the floor)', async () => {
    const fetchStub = vi.fn(() =>
      Promise.resolve(snapshotResponse([wireEntry('finance'), EXTERNAL_WIRE]))
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
    expect(screen.getByTestId('rail-finance')).toBeInTheDocument();
    expect(screen.getByTestId('rail-weather')).toBeInTheDocument();
    // Wire nav.order keeps the rail ordered (finance=10 in-repo < weather=35).
    const ids = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(ids.indexOf('finance')).toBeLessThan(ids.indexOf('weather'));
  });

  it('renders the static floor (never blank) when the boot fetch fails', async () => {
    const fetchStub = vi.fn(() => Promise.reject(new Error('ECONNREFUSED')));
    const bootRegistry = await fetchBootRegistry({ fetch: fetchStub });
    expect(bootRegistry.source).toBe('static-floor');

    renderRail(bootRegistry);

    // Even on a dead registry the rendered rail is the full in-repo floor.
    await waitFor(() => expect(screen.getByTestId('rail-finance')).toBeInTheDocument());
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('rail-weather')).not.toBeInTheDocument();
  });
});
