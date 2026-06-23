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

// Empty snapshot → the static bundle-map floor, so `registeredApps` carries
// the in-repo pillars in nav.order — the ordering the redirect tests assert.
const STATIC_FLOOR = resolveBootRegistry([]);

function snapshotEntry(pillarId: string): PillarSnapshot {
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
    },
    registered: true,
    lastSeenAt: new Date(0),
  };
}

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
function renderAt(
  primed?: { apps: string[] },
  bootRegistry: typeof STATIC_FLOOR = STATIC_FLOOR
): void {
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

  it('falls back to /finance when the manifest has not yet loaded', () => {
    mocks.manifest.mockReturnValue(new Promise(() => undefined));
    renderAt();
    expect(screen.getByTestId('landed')).toHaveTextContent('/finance');
  });

  it('falls back to /finance when the registry pillar is unavailable', async () => {
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
