import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListQuery = vi.fn();
const mockHealthMutate = vi.fn();
const mockSyncMutate = vi.fn();
const invalidateList = vi.fn().mockResolvedValue(undefined);

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      cerebrum: { plexus: { adapters: { list: { invalidate: invalidateList } } } },
    }),
    cerebrum: {
      plexus: {
        adapters: {
          list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
          healthCheck: {
            useMutation: () => ({ mutate: mockHealthMutate, isPending: false, error: null }),
          },
          sync: {
            useMutation: () => ({ mutate: mockSyncMutate, isPending: false, error: null }),
          },
        },
      },
    },
  },
}));

import { PlexusListPage } from './PlexusListPage';

import type { PlexusAdapter } from '../plexus/types';

function buildAdapter(overrides: Partial<PlexusAdapter> = {}): PlexusAdapter {
  return {
    id: 'gmail',
    name: 'Gmail',
    status: 'healthy',
    config: { interval: '15m' },
    lastHealth: '2026-05-11T01:00:00Z',
    lastError: null,
    ingestedCount: 42,
    emittedCount: 0,
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-11T01:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PlexusListPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PlexusListPage', () => {
  it('renders the loading skeleton during fetch', () => {
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('plexus-loading')).toBeInTheDocument();
  });

  it('renders the empty state when no adapters exist', () => {
    mockListQuery.mockReturnValue({
      data: { adapters: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No adapters registered')).toBeInTheDocument();
  });

  it('renders error state with retry', async () => {
    const refetch = vi.fn();
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'boom' },
      refetch,
    });
    renderPage();
    expect(screen.getByTestId('plexus-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders rows and triggers health-check + sync mutations', async () => {
    mockListQuery.mockReturnValue({
      data: { adapters: [buildAdapter()] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getAllByTestId('plexus-row')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: /health check/i }));
    expect(mockHealthMutate).toHaveBeenCalledWith({ adapterId: 'gmail' });
    await userEvent.click(screen.getByRole('button', { name: /^sync$/i }));
    expect(mockSyncMutate).toHaveBeenCalledWith({ adapterId: 'gmail' });
  });
});
