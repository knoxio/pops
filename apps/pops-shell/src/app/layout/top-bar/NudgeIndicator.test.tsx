import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import { PillarSdkProvider } from '@pops/pillar-sdk/react';

import { NudgeIndicator, nudgeRefetchInterval } from './NudgeIndicator';

import type { ReactNode } from 'react';

import type { DiscoveredPillar, DiscoveryTransport } from '@pops/pillar-sdk/client';

const q = (fetchFailureCount: number) => ({ state: { fetchFailureCount } });

describe('nudgeRefetchInterval', () => {
  it('returns 60s when there are no failures', () => {
    expect(nudgeRefetchInterval(q(0))).toBe(60_000);
  });

  it('doubles the interval on each consecutive failure', () => {
    expect(nudgeRefetchInterval(q(1))).toBe(120_000);
    expect(nudgeRefetchInterval(q(2))).toBe(240_000);
    expect(nudgeRefetchInterval(q(3))).toBe(480_000);
    expect(nudgeRefetchInterval(q(4))).toBe(960_000);
  });

  it('stops polling after 5 consecutive failures', () => {
    expect(nudgeRefetchInterval(q(5))).toBe(false);
    expect(nudgeRefetchInterval(q(10))).toBe(false);
  });

  it('recovers to 60s when fetchFailureCount resets to 0 after a success', () => {
    expect(nudgeRefetchInterval(q(5))).toBe(false);
    expect(nudgeRefetchInterval(q(0))).toBe(60_000);
  });
});

function cerebrumDiscoveredPillar(): DiscoveredPillar {
  return {
    pillarId: 'cerebrum',
    baseUrl: 'http://cerebrum-api:3007',
    status: 'healthy',
    lastSeenAt: '2026-06-13T00:00:00.000Z',
    registered: true,
    manifest: {
      pillar: 'cerebrum',
      version: '1.0.0',
      contract: {
        package: '@pops/cerebrum-contract',
        version: '1.0.0',
        tag: 'contract-cerebrum@v1.0.0',
      },
      routes: {
        queries: ['cerebrum.nudges.list'],
        mutations: [],
        subscriptions: [],
      },
      search: { adapters: [] },
      ai: { tools: [] },
      uri: { types: [] },
      settings: { keys: [] },
      healthcheck: { path: '/healthz' },
    },
  };
}

class StubTransport implements DiscoveryTransport {
  constructor(private readonly pillars: readonly DiscoveredPillar[]) {}
  async fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    return this.pillars;
  }
}

type FetchResponder = (url: string, init: RequestInit | undefined) => Response;

function stubFetch(responder: FetchResponder): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    return responder(url, init);
  };
  return wrapped;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderWithSdk(opts: { transport: DiscoveryTransport; fetchImpl: typeof fetch }): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <PillarSdkProvider options={{ transport: opts.transport, fetchImpl: opts.fetchImpl }}>
          {children}
        </PillarSdkProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
  render(<NudgeIndicator />, { wrapper });
}

describe('NudgeIndicator', () => {
  beforeEach(() => {
    __resetSharedPillarClient();
  });

  afterEach(() => {
    __resetSharedPillarClient();
  });

  it('renders the bell with a badge when the SDK returns pending nudges', async () => {
    const transport = new StubTransport([cerebrumDiscoveredPillar()]);
    const fetchImpl = stubFetch((url) => {
      expect(url).toBe('http://cerebrum-api:3007/trpc/cerebrum.nudges.list');
      return jsonResponse({ result: { data: { nudges: [], total: 3 } } });
    });

    renderWithSdk({ transport, fetchImpl });

    const button = await screen.findByRole('button', { name: 'Nudges: 3 pending' });
    await waitFor(() => {
      expect(button.textContent).toContain('3');
    });
  });

  it('caps the badge at 99+ when the SDK returns more than 99 pending', async () => {
    const transport = new StubTransport([cerebrumDiscoveredPillar()]);
    const fetchImpl = stubFetch(() =>
      jsonResponse({ result: { data: { nudges: [], total: 250 } } })
    );

    renderWithSdk({ transport, fetchImpl });

    await screen.findByRole('button', { name: 'Nudges: 250 pending' });
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });

  it('renders the bell without a badge when there are zero pending nudges', async () => {
    const transport = new StubTransport([cerebrumDiscoveredPillar()]);
    const fetchImpl = stubFetch(() => jsonResponse({ result: { data: { nudges: [], total: 0 } } }));

    renderWithSdk({ transport, fetchImpl });

    await screen.findByRole('button', { name: 'Nudges: 0 pending' });
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('hides the indicator when the cerebrum pillar is unavailable', async () => {
    const transport = new StubTransport([]);
    const fetchImpl = stubFetch(() => {
      throw new Error('SDK should short-circuit before performing an HTTP call');
    });

    renderWithSdk({ transport, fetchImpl });

    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('hides the indicator when the SDK reports a contract mismatch (HTTP 404)', async () => {
    const transport = new StubTransport([cerebrumDiscoveredPillar()]);
    const fetchImpl = stubFetch(() => jsonResponse({ message: 'not found' }, 404));

    renderWithSdk({ transport, fetchImpl });

    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
