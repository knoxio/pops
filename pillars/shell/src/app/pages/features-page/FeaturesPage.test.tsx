import { CoreApiError } from '@/core-api-helpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getManifests: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/core-api', () => ({
  featuresGetManifests: (...args: unknown[]) => mocks.getManifests(...args),
  featuresList: (...args: unknown[]) => mocks.list(...args),
}));

vi.mock('./FeatureCard', () => ({
  FeatureCard: ({ feature }: { feature: { key: string } }) => (
    <div data-testid={`feature-${feature.key}`}>{feature.key}</div>
  ),
}));

import { FeaturesPage } from './FeaturesPage';

/** Wraps the Hey API `{ data }` envelope the SDK functions resolve to. */
function manifestsData(manifests: { id: string; title: string }[]) {
  return Promise.resolve({ data: { manifests } });
}
function listData(features: { key: string; manifestId: string }[]) {
  return Promise.resolve({ data: { features } });
}

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FeaturesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('FeaturesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues both core feature queries', async () => {
    mocks.getManifests.mockReturnValue(manifestsData([]));
    mocks.list.mockReturnValue(listData([]));
    renderPage();
    await waitFor(() => expect(mocks.getManifests).toHaveBeenCalled());
    expect(mocks.list).toHaveBeenCalled();
  });

  it('renders the empty state when no features are registered', async () => {
    mocks.getManifests.mockReturnValue(manifestsData([]));
    mocks.list.mockReturnValue(listData([]));
    renderPage();
    await waitFor(() => expect(screen.getByText('No features registered.')).toBeInTheDocument());
  });

  it('groups features by manifest and renders one FeatureCard per status', async () => {
    mocks.getManifests.mockReturnValue(manifestsData([{ id: 'plex', title: 'Plex' }]));
    mocks.list.mockReturnValue(
      listData([
        { key: 'plex.import', manifestId: 'plex' },
        { key: 'plex.refresh', manifestId: 'plex' },
      ])
    );
    renderPage();
    await waitFor(() => expect(screen.getByText('Plex')).toBeInTheDocument());
    expect(screen.getByTestId('feature-plex.import')).toBeInTheDocument();
    expect(screen.getByTestId('feature-plex.refresh')).toBeInTheDocument();
  });

  it('renders the empty state (not the skeleton) when the core pillar is unavailable', async () => {
    mocks.getManifests.mockRejectedValue(new CoreApiError('down', 503));
    mocks.list.mockRejectedValue(new CoreApiError('down', 503));
    renderPage();
    await waitFor(() => expect(screen.getByText('No features registered.')).toBeInTheDocument());
  });
});
