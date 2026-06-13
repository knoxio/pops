import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListQuery = vi.fn();
const mockHealthMutate = vi.fn();
const mockSyncMutate = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'plexus.adapters.list') return mockListQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'plexus.adapters.healthCheck') {
      return { mutate: mockHealthMutate, isPending: false, error: null };
    }
    if (key === 'plexus.adapters.sync') {
      return { mutate: mockSyncMutate, isPending: false, error: null };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
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
