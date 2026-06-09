/**
 * Tests for the shell-side PillarStatusProvider (ADR-026 P3).
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PillarStatusProvider } from './PillarStatusProvider';
import { usePillarStatus, usePillarStatusContext } from './usePillarStatus';

// The provider's effect calls fetch via the registry-client module.
vi.mock('./pillar-registry-client', () => ({
  fetchPillarRegistry: vi.fn(),
  fetchPillarHealth: vi.fn(),
}));

import { fetchPillarHealth, fetchPillarRegistry } from './pillar-registry-client';

beforeEach(() => {
  vi.mocked(fetchPillarRegistry).mockReset();
  vi.mocked(fetchPillarHealth).mockReset();
});

function StatusProbe({ pillarId }: { pillarId: string }): React.ReactElement {
  const status = usePillarStatus(pillarId);
  const { loading } = usePillarStatusContext();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="loading">{loading ? 'loading' : 'idle'}</span>
    </div>
  );
}

describe('PillarStatusProvider', () => {
  it('renders the test-only snapshot synchronously and skips the boot fetch', () => {
    render(
      <PillarStatusProvider
        snapshot={{
          entries: [{ id: 'core', baseUrl: '' }],
          health: { core: 'healthy', food: 'unavailable' },
        }}
      >
        <StatusProbe pillarId="food" />
      </PillarStatusProvider>
    );
    expect(screen.getByTestId('status').textContent).toBe('unavailable');
    expect(screen.getByTestId('loading').textContent).toBe('idle');
    expect(fetchPillarRegistry).not.toHaveBeenCalled();
    expect(fetchPillarHealth).not.toHaveBeenCalled();
  });

  it('starts in the loading state with no known pillar status until the boot fetch resolves', async () => {
    let resolveRegistry: (value: readonly { id: string; baseUrl: string }[]) => void = () => {};
    let resolveHealth: (value: Record<string, 'healthy' | 'unavailable'>) => void = () => {};
    vi.mocked(fetchPillarRegistry).mockImplementation(
      () => new Promise((resolve) => (resolveRegistry = resolve))
    );
    vi.mocked(fetchPillarHealth).mockImplementation(
      () => new Promise((resolve) => (resolveHealth = resolve))
    );

    render(
      <PillarStatusProvider>
        <StatusProbe pillarId="food" />
      </PillarStatusProvider>
    );
    // Initially loading and no health entries — every pillar is 'unknown'.
    expect(screen.getByTestId('status').textContent).toBe('unknown');
    expect(screen.getByTestId('loading').textContent).toBe('loading');

    await act(async () => {
      resolveRegistry([
        { id: 'core', baseUrl: '' },
        { id: 'food', baseUrl: 'http://food-api:3000' },
      ]);
      resolveHealth({ core: 'healthy', food: 'unavailable' });
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unavailable');
      expect(screen.getByTestId('loading').textContent).toBe('idle');
    });
  });

  it('reports "unknown" for a pillar id missing from the health map after boot', async () => {
    vi.mocked(fetchPillarRegistry).mockResolvedValue([{ id: 'core', baseUrl: '' }]);
    vi.mocked(fetchPillarHealth).mockResolvedValue({ core: 'healthy' });
    render(
      <PillarStatusProvider>
        <StatusProbe pillarId="food" />
      </PillarStatusProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('idle');
    });
    expect(screen.getByTestId('status').textContent).toBe('unknown');
  });

  it('re-fetches when refresh() is called', async () => {
    vi.mocked(fetchPillarRegistry).mockResolvedValue([{ id: 'core', baseUrl: '' }]);
    vi.mocked(fetchPillarHealth)
      .mockResolvedValueOnce({ food: 'unavailable' })
      .mockResolvedValueOnce({ food: 'healthy' });

    function Trigger(): React.ReactElement {
      const { refresh } = usePillarStatusContext();
      return (
        <button type="button" onClick={() => void refresh()}>
          refresh
        </button>
      );
    }

    render(
      <PillarStatusProvider>
        <StatusProbe pillarId="food" />
        <Trigger />
      </PillarStatusProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unavailable');
    });

    await act(async () => {
      screen.getByRole('button', { name: 'refresh' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('healthy');
    });
    expect(fetchPillarHealth).toHaveBeenCalledTimes(2);
  });
});

describe('usePillarStatusContext', () => {
  it('throws when used outside a PillarStatusProvider', () => {
    function Naked(): React.ReactElement {
      usePillarStatusContext();
      return <span />;
    }
    // React 18 logs to console.error on render-throw; suppress to keep test output clean.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => render(<Naked />)).toThrow(/inside <PillarStatusProvider>/);
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// Sanity check: setState inside `useState` is wired so re-mounts keep working
// across tests (this guards against accidental module-level state).
describe('PillarStatusProvider isolation', () => {
  it('re-runs the boot fetch on a fresh mount with default props', async () => {
    vi.mocked(fetchPillarRegistry).mockResolvedValue([{ id: 'core', baseUrl: '' }]);
    vi.mocked(fetchPillarHealth).mockResolvedValue({ core: 'healthy' });

    function Wrapper(): React.ReactElement {
      const [n, setN] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setN((x) => x + 1)}>
            remount-{n}
          </button>
          <PillarStatusProvider key={n}>
            <StatusProbe pillarId="core" />
          </PillarStatusProvider>
        </div>
      );
    }

    render(<Wrapper />);
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('healthy');
    });
    expect(fetchPillarRegistry).toHaveBeenCalledTimes(1);

    await act(async () => {
      screen.getByRole('button', { name: /remount-/ }).click();
    });
    await waitFor(() => {
      expect(fetchPillarRegistry).toHaveBeenCalledTimes(2);
    });
  });
});
