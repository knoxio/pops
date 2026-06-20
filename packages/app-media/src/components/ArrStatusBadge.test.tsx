import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const arrConfigMock = vi.hoisted(() => vi.fn());
const arrGetMovieStatusMock = vi.hoisted(() => vi.fn());
const arrGetShowStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  arrConfig: (...args: unknown[]) => arrConfigMock(...args),
  arrGetMovieStatus: (...args: unknown[]) => arrGetMovieStatusMock(...args),
  arrGetShowStatus: (...args: unknown[]) => arrGetShowStatusMock(...args),
}));

import { ArrStatusBadge } from './ArrStatusBadge';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderBadge(props: { kind: 'movie' | 'show'; externalId: number }) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<ArrStatusBadge {...props} />, { wrapper });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  arrConfigMock.mockResolvedValue(ok({ data: { radarrConfigured: true, sonarrConfigured: true } }));
  arrGetMovieStatusMock.mockResolvedValue(
    ok({ data: { status: 'not_found', label: 'Not Found' } })
  );
  arrGetShowStatusMock.mockResolvedValue(ok({ data: { status: 'not_found', label: 'Not Found' } }));
});

describe('ArrStatusBadge', () => {
  it('renders nothing when service is not configured', async () => {
    arrConfigMock.mockResolvedValue(
      ok({ data: { radarrConfigured: false, sonarrConfigured: false } })
    );
    const { container } = renderBadge({ kind: 'movie', externalId: 123 });
    await waitFor(() => expect(arrConfigMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    expect(arrGetMovieStatusMock).not.toHaveBeenCalled();
  });

  it('renders Radarr unavailable badge when Radarr is unreachable', async () => {
    arrGetMovieStatusMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Connection refused' },
      response: { status: 500 },
    });
    renderBadge({ kind: 'movie', externalId: 123 });
    expect(await screen.findByText('Radarr unavailable')).toBeInTheDocument();
  });

  it('renders Sonarr unavailable badge when Sonarr is unreachable', async () => {
    arrGetShowStatusMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Connection refused' },
      response: { status: 500 },
    });
    renderBadge({ kind: 'show', externalId: 456 });
    expect(await screen.findByText('Sonarr unavailable')).toBeInTheDocument();
  });

  it('renders nothing while loading', () => {
    arrGetMovieStatusMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderBadge({ kind: 'movie', externalId: 123 });
    expect(container.innerHTML).toBe('');
  });

  it('renders Available badge with green styling', async () => {
    arrGetMovieStatusMock.mockResolvedValue(
      ok({ data: { status: 'available', label: 'Available' } })
    );
    renderBadge({ kind: 'movie', externalId: 123 });
    const badge = await screen.findByText('Available');
    expect(badge.className).toContain('bg-success');
  });

  it('renders Downloading badge with yellow styling', async () => {
    arrGetMovieStatusMock.mockResolvedValue(
      ok({ data: { status: 'downloading', label: 'Downloading' } })
    );
    renderBadge({ kind: 'movie', externalId: 123 });
    const badge = await screen.findByText('Downloading');
    expect(badge.className).toContain('bg-warning');
  });

  it('renders Monitored badge with yellow styling', async () => {
    arrGetMovieStatusMock.mockResolvedValue(
      ok({ data: { status: 'monitored', label: 'Monitored' } })
    );
    renderBadge({ kind: 'movie', externalId: 123 });
    const badge = await screen.findByText('Monitored');
    expect(badge.className).toContain('bg-warning');
  });

  it('renders Not Monitored badge with grey styling', async () => {
    arrGetMovieStatusMock.mockResolvedValue(
      ok({ data: { status: 'unmonitored', label: 'Not Monitored' } })
    );
    renderBadge({ kind: 'movie', externalId: 123 });
    const badge = await screen.findByText('Not Monitored');
    expect(badge.className).toContain('bg-muted');
  });

  it('works for TV shows using sonarr', async () => {
    arrGetShowStatusMock.mockResolvedValue(
      ok({ data: { status: 'monitored', label: 'Monitored' } })
    );
    renderBadge({ kind: 'show', externalId: 456 });
    const badge = await screen.findByText('Monitored');
    expect(badge.className).toContain('bg-warning');
  });
});
