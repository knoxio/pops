/**
 * Tests for the pillar-unavailable placeholder (ADR-026 P3).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) => {
      if (options?.pillar !== undefined) return `${key}:${options.pillar}`;
      return key;
    },
  }),
}));

// Same boot-fetch mock pattern as PillarStatusProvider.test.tsx — the
// retry button calls the context's `refresh()`, which re-invokes the
// registry-client. We assert on the call count.
vi.mock('./pillar-registry-client', () => ({
  fetchPillarRegistry: vi.fn(),
  fetchPillarHealth: vi.fn(),
}));

import { fetchPillarHealth, fetchPillarRegistry } from './pillar-registry-client';
import { PillarStatusProvider } from './PillarStatusProvider';
import { PillarUnavailableRoute } from './PillarUnavailableRoute';

import type { PillarBootSnapshot } from './types';

const UNAVAILABLE_SNAPSHOT: PillarBootSnapshot = {
  entries: [],
  health: { food: 'unavailable' },
};

beforeEach(() => {
  vi.mocked(fetchPillarRegistry).mockReset();
  vi.mocked(fetchPillarHealth).mockReset();
});

describe('PillarUnavailableRoute', () => {
  it('renders the title and a description that mentions the pillar id', () => {
    render(
      <PillarStatusProvider snapshot={UNAVAILABLE_SNAPSHOT}>
        <PillarUnavailableRoute pillarId="food" />
      </PillarStatusProvider>
    );
    expect(screen.getByText('pillarUnavailableTitle')).toBeInTheDocument();
    expect(screen.getByText('pillarUnavailableDescription:food')).toBeInTheDocument();
  });

  it('renders a retry button that triggers refresh on the context', async () => {
    vi.mocked(fetchPillarRegistry).mockResolvedValue([{ id: 'core', baseUrl: '' }]);
    vi.mocked(fetchPillarHealth).mockResolvedValue({ food: 'unavailable' });

    // No `snapshot` prop → provider runs the real boot fetch, exercising the
    // refresh path. After mount the registry + health endpoints are called
    // exactly once each; clicking Retry must re-invoke both.
    render(
      <PillarStatusProvider>
        <PillarUnavailableRoute pillarId="food" />
      </PillarStatusProvider>
    );

    await waitFor(() => {
      expect(fetchPillarRegistry).toHaveBeenCalledTimes(1);
      expect(fetchPillarHealth).toHaveBeenCalledTimes(1);
    });

    const button = screen.getByRole('button', { name: 'pillarUnavailableRetry' });
    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => {
      expect(fetchPillarRegistry).toHaveBeenCalledTimes(2);
      expect(fetchPillarHealth).toHaveBeenCalledTimes(2);
    });
  });
});
