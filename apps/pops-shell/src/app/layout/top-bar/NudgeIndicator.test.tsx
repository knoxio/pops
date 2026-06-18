import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NudgeIndicator, nudgeRefetchInterval } from './NudgeIndicator';

import type { ReactNode } from 'react';

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderIndicator(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  render(<NudgeIndicator />, { wrapper });
}

describe('NudgeIndicator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the pending filter to /cerebrum-api/nudges/search and badges the total', async () => {
    const fetchSpy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(typeof input === 'string' ? input : input.toString()).toBe(
        '/cerebrum-api/nudges/search'
      );
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ status: 'pending', limit: 1 });
      return Promise.resolve(jsonResponse({ nudges: [], total: 3 }));
    });
    vi.stubGlobal('fetch', fetchSpy);

    renderIndicator();

    const button = await screen.findByRole('button', { name: 'Nudges: 3 pending' });
    await waitFor(() => {
      expect(button.textContent).toContain('3');
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('caps the badge at 99+ when more than 99 are pending', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ nudges: [], total: 250 })));

    renderIndicator();

    await screen.findByRole('button', { name: 'Nudges: 250 pending' });
    await waitFor(() => {
      expect(screen.getByText('99+')).toBeInTheDocument();
    });
  });

  it('renders the bell without a badge when there are zero pending nudges', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ nudges: [], total: 0 })));

    renderIndicator();

    await screen.findByRole('button', { name: 'Nudges: 0 pending' });
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('hides the indicator when the pillar returns not-found (HTTP 404)', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse({ message: 'not found' }, 404)));

    renderIndicator();

    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('hides the indicator when cerebrum is unreachable (network error)', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('network down')));

    renderIndicator();

    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
