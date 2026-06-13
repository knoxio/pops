import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (pillarId: string, path: readonly string[], input: unknown) =>
    mocks.query({ pillarId, path: [...path], input }),
}));

vi.mock('./FeatureCard', () => ({
  FeatureCard: ({ feature }: { feature: { key: string } }) => (
    <div data-testid={`feature-${feature.key}`}>{feature.key}</div>
  ),
}));

import { FeaturesPage } from './FeaturesPage';

type ManifestsData = { manifests: { id: string; title: string }[] };
type ListData = { features: { key: string; manifestId: string }[] };

function manifestsResult(manifests: ManifestsData['manifests'] = []): {
  data: ManifestsData | undefined;
  isLoading: boolean;
  isUnavailable: boolean;
  isContractMismatch: boolean;
} {
  return {
    data: { manifests },
    isLoading: false,
    isUnavailable: false,
    isContractMismatch: false,
  };
}

function listResult(features: ListData['features'] = []): {
  data: ListData | undefined;
  isLoading: boolean;
  isUnavailable: boolean;
  isContractMismatch: boolean;
} {
  return {
    data: { features },
    isLoading: false,
    isUnavailable: false,
    isContractMismatch: false,
  };
}

function wireQueries(opts: {
  manifests: ReturnType<typeof manifestsResult>;
  list: ReturnType<typeof listResult>;
}): void {
  mocks.query.mockImplementation(({ path }: { path: string[] }) => {
    if (path.join('.') === 'features.getManifests') return opts.manifests;
    if (path.join('.') === 'features.list') return opts.list;
    throw new Error(`Unexpected query path: ${path.join('.')}`);
  });
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <FeaturesPage />
    </MemoryRouter>
  );
}

describe('FeaturesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues both queries against the core pillar', () => {
    wireQueries({ manifests: manifestsResult(), list: listResult() });
    renderPage();
    expect(mocks.query).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['features', 'getManifests'],
      input: undefined,
    });
    expect(mocks.query).toHaveBeenCalledWith({
      pillarId: 'core',
      path: ['features', 'list'],
      input: undefined,
    });
  });

  it('renders the empty state when no features are registered', () => {
    wireQueries({ manifests: manifestsResult(), list: listResult() });
    renderPage();
    expect(screen.getByText('No features registered.')).toBeInTheDocument();
  });

  it('groups features by manifest and renders one FeatureCard per status', () => {
    wireQueries({
      manifests: manifestsResult([{ id: 'plex', title: 'Plex' }]),
      list: listResult([
        { key: 'plex.import', manifestId: 'plex' },
        { key: 'plex.refresh', manifestId: 'plex' },
      ]),
    });
    renderPage();
    expect(screen.getByText('Plex')).toBeInTheDocument();
    expect(screen.getByTestId('feature-plex.import')).toBeInTheDocument();
    expect(screen.getByTestId('feature-plex.refresh')).toBeInTheDocument();
  });

  it('renders the empty state (not the skeleton) when the core pillar is unavailable', () => {
    wireQueries({
      manifests: { ...manifestsResult(), isLoading: true, isUnavailable: true, data: undefined },
      list: { ...listResult(), isLoading: true, isUnavailable: true, data: undefined },
    });
    renderPage();
    expect(screen.getByText('No features registered.')).toBeInTheDocument();
  });

  it('renders the empty state (not the skeleton) when the contract has drifted', () => {
    wireQueries({
      manifests: {
        ...manifestsResult(),
        isLoading: true,
        isContractMismatch: true,
        data: undefined,
      },
      list: { ...listResult(), isLoading: true, isContractMismatch: true, data: undefined },
    });
    renderPage();
    expect(screen.getByText('No features registered.')).toBeInTheDocument();
  });
});
