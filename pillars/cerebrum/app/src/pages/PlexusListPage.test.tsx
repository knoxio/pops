import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

import type { PlexusAdapter } from '../plexus/types';

const sdk = vi.hoisted(() => ({
  plexusAdaptersList: vi.fn(),
  plexusAdaptersHealthCheck: vi.fn(),
  plexusAdaptersSync: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

import { PlexusListPage } from './PlexusListPage';

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
    withQueryClient(
      <MemoryRouter>
        <PlexusListPage />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.plexusAdaptersHealthCheck.mockResolvedValue({ data: { ok: true } });
  sdk.plexusAdaptersSync.mockResolvedValue({ data: { ok: true } });
});

describe('PlexusListPage', () => {
  it('renders the loading skeleton during fetch', () => {
    sdk.plexusAdaptersList.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByTestId('plexus-loading')).toBeInTheDocument();
  });

  it('renders the empty state when no adapters exist', async () => {
    sdk.plexusAdaptersList.mockResolvedValue({ data: { adapters: [] } });
    renderPage();
    expect(await screen.findByText('No adapters registered')).toBeInTheDocument();
  });

  it('renders error state with retry', async () => {
    sdk.plexusAdaptersList.mockResolvedValue({
      error: { message: 'boom' },
      response: { status: 500 },
    });
    renderPage();
    expect(await screen.findByTestId('plexus-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(sdk.plexusAdaptersList).toHaveBeenCalledTimes(2));
  });

  it('renders rows and triggers health-check + sync mutations', async () => {
    sdk.plexusAdaptersList.mockResolvedValue({ data: { adapters: [buildAdapter()] } });
    renderPage();
    expect(await screen.findByTestId('plexus-row')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /health check/i }));
    await waitFor(() =>
      expect(sdk.plexusAdaptersHealthCheck).toHaveBeenCalledWith({ path: { adapterId: 'gmail' } })
    );
    await userEvent.click(screen.getByRole('button', { name: /^sync$/i }));
    await waitFor(() =>
      expect(sdk.plexusAdaptersSync).toHaveBeenCalledWith({ path: { adapterId: 'gmail' } })
    );
  });
});
