import { CoreApiError } from '@/core-api-helpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  manifest: vi.fn(),
}));

vi.mock('@/core-api', () => ({
  shellManifest: (...args: unknown[]) => mocks.manifest(...args),
}));

import { IndexRedirect } from './IndexRedirect';

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
function renderAt(primed?: { apps: string[] }): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (primed) {
    client.setQueryData(['core', 'shell', 'manifest'], { apps: primed.apps, overlays: [] });
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<IndexRedirect />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
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

  it('falls back to /finance when the core pillar is unavailable', async () => {
    mocks.manifest.mockRejectedValue(new CoreApiError('down', 503));
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
});
