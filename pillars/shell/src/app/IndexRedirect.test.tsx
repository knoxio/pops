import { RegistryApiError } from '@/registry-api-helpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  manifest: vi.fn(),
}));

vi.mock('@/registry-api', () => ({
  shellManifest: (...args: unknown[]) => mocks.manifest(...args),
}));

import { resolveBootRegistry } from './boot-snapshot';
import { BootRegistryProvider } from './BootRegistryProvider';
import { IndexRedirect } from './IndexRedirect';

import type { PillarSnapshot } from '@pops/pillar-sdk';

/**
 * Nav orders matching the pillars' own manifests, so the rail these fixtures
 * produce is ordered the way the real one is.
 */
const NAV_ORDER: Readonly<Record<string, number>> = {
  finance: 10,
  media: 20,
  inventory: 30,
  food: 40,
};

/**
 * A registered pillar carrying the UI surface the loader needs.
 *
 * Every pillar advertises `nav` / `pages` / `assetsBaseUrl` since POPS-3215;
 * before it, an entry with none of them still reached the rail through the
 * static bundle map. POPS-3227 removed that map outright, so a fixture
 * without a UI surface now resolves to nothing — which is the correct
 * behaviour and was silently doing the opposite here.
 */
function snapshotEntry(pillarId: string): PillarSnapshot {
  const order = NAV_ORDER[pillarId] ?? 90;
  return {
    pillarId,
    baseUrl: `http://${pillarId}-api:3001`,
    manifest: {
      pillar: pillarId,
      version: '1.0.0',
      contract: {
        package: `@pops/${pillarId}`,
        version: '1.0.0',
        tag: `contract-${pillarId}@v1.0.0`,
      },
      routes: { queries: [], mutations: [], subscriptions: [] },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      consumedSettings: { keys: [] },
      healthcheck: { path: '/health' },
      assetsBaseUrl: `/${pillarId}-ui/${pillarId}.js`,
      nav: {
        id: pillarId,
        label: pillarId,
        labelKey: pillarId,
        icon: 'compass',
        basePath: `/${pillarId}`,
        order,
        items: [{ path: '', label: pillarId, labelKey: `${pillarId}.home`, icon: 'compass' }],
      },
      pages: [{ path: '', index: true, bundleSlot: `${pillarId}-home` }],
    },
    registered: true,
    lastSeenAt: new Date(0),
  };
}

/**
 * The rail a normal deploy produces: several pillars, ordered by `nav.order`.
 *
 * It comes from a registry snapshot rather than the static floor, because that
 * floor no longer exists — the redirect's "first installed app" is whatever
 * the registry lists, and nothing else.
 */
const LIVE_RAIL = resolveBootRegistry([
  snapshotEntry('finance'),
  snapshotEntry('media'),
  snapshotEntry('inventory'),
]);

// A live registry where finance is NOT registered: the rail's first live app
// is `media`. The redirect must land there, NOT on a `/finance` literal.
const FINANCE_LESS = resolveBootRegistry([snapshotEntry('media'), snapshotEntry('inventory')]);

function LocationProbe() {
  const { pathname } = useLocation();
  return <div data-testid="landed">{pathname}</div>;
}

/**
 * `IndexRedirect` redirects on its first render and then unmounts, so the
 * manifest must already be resolved before the route mounts for the "pick an
 * app" path to be exercised. `primed` seeds the react-query cache so `useQuery`
 * returns data synchronously — mirroring a warm cache (staleTime: Infinity).
 * Without priming, the optimistic `/finance` fallback wins, which is the real
 * cold-start behaviour.
 */
function renderAt(primed?: { apps: string[] }, bootRegistry: typeof LIVE_RAIL = LIVE_RAIL): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (primed) {
    client.setQueryData(['core', 'shell', 'manifest'], { apps: primed.apps, overlays: [] });
  }
  render(
    <QueryClientProvider client={client}>
      <BootRegistryProvider value={bootRegistry}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<IndexRedirect />} />
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </BootRegistryProvider>
    </QueryClientProvider>
  );
}

/** Resolves the Hey API `{ data }` envelope the SDK functions return. */
function manifestData(apps: string[]) {
  return Promise.resolve({ data: { apps, overlays: [] } });
}

describe('IndexRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a manifest query against the core pillar', async () => {
    mocks.manifest.mockReturnValue(manifestData(['cerebrum']));
    renderAt();
    await waitFor(() => expect(mocks.manifest).toHaveBeenCalled());
  });

  // `/media`, not `/finance`: the fallback is the first app on the resolved
  // rail, not a hardcoded literal. Finance wins here only because its
  // `nav.order` is lowest — not because anything spells `/finance`. The pair
  // of finance-less tests below is what holds those two apart.
  it('falls back to the first app on the rail when the manifest has not yet loaded', () => {
    mocks.manifest.mockReturnValue(new Promise(() => undefined));
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/finance');
  });

  it('falls back to the first app on the rail when the registry pillar is unavailable', async () => {
    mocks.manifest.mockRejectedValue(new RegistryApiError('down', 503));
    renderAt();
    await waitFor(() => expect(mocks.manifest).toHaveBeenCalled());
    expect(screen.getByTestId('landed')).toHaveTextContent('/finance');
  });

  it('picks the first installed app by nav.order ascending (finance > media > inventory > food > lists > cerebrum > ai)', () => {
    renderAt({ apps: ['cerebrum', 'media', 'inventory'] });
    expect(screen.getByTestId('landed')).toHaveTextContent('/media');
  });

  it('redirects to /settings when no registered app is installed', () => {
    renderAt({ apps: ['unknown'] });
    expect(screen.getByTestId('landed')).toHaveTextContent('/settings');
  });

  it('falls back to the first LIVE app (not a /finance literal) when finance is unregistered', () => {
    // Cold start (manifest unloaded) against a finance-less registry: the
    // optimistic target must be the first live rail app (media), not /finance —
    // navigating to an unmounted /finance would flash NotInstalledPage.
    mocks.manifest.mockReturnValue(new Promise(() => undefined));
    renderAt(undefined, FINANCE_LESS);
    expect(screen.getByTestId('landed')).toHaveTextContent('/media');
  });

  it('picks the first live app present in the manifest on a finance-less registry', () => {
    renderAt({ apps: ['inventory', 'media'] }, FINANCE_LESS);
    expect(screen.getByTestId('landed')).toHaveTextContent('/media');
  });
});
