/**
 * SettingsPage tests — hash-based deep linking and post-mount navigation.
 *
 * Issue: #2464 — hash changes after initial mount must update the active group
 * (back/forward, address-bar edits, programmatic `window.location.hash = '...'`).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getManifests: vi.fn(),
  setBulkMutate: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({}),
    core: {
      settings: {
        getManifests: { useQuery: () => mocks.getManifests() },
        getBulk: { useQuery: () => ({ data: { settings: {} }, isLoading: false }) },
        setBulk: { useMutation: () => ({ mutate: mocks.setBulkMutate }) },
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/settings/SectionRenderer', () => ({
  SectionRenderer: ({ manifest }: { manifest: { id: string } }) => (
    <div data-testid="section-renderer">section:{manifest.id}</div>
  ),
}));

import { SettingsPage } from './SettingsPage';

const MANIFESTS = [
  { id: 'finance', title: 'Finance', order: 0, groups: [] },
  { id: 'media.plex', title: 'Plex', order: 1, groups: [] },
  { id: 'cerebrum', title: 'Cerebrum', order: 2, groups: [] },
];

function setHash(hash: string) {
  window.history.replaceState(null, '', `#${hash}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
}

describe('SettingsPage hash-based deep linking', () => {
  beforeEach(() => {
    mocks.getManifests.mockReturnValue({
      data: { manifests: MANIFESTS },
      isLoading: false,
    });
    window.history.replaceState(null, '', '/settings');
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/settings');
  });

  it('uses the initial hash to pick the active group on mount', async () => {
    window.history.replaceState(null, '', '/settings#cerebrum');
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:cerebrum')
    );
  });

  it('falls back to the first manifest when the hash is empty', async () => {
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );
  });

  it('falls back to the first manifest when the hash is unknown', async () => {
    window.history.replaceState(null, '', '/settings#does-not-exist');
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );
  });

  it('updates the active group when the hash changes after mount', async () => {
    window.history.replaceState(null, '', '/settings#finance');
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );

    act(() => setHash('media.plex'));
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:media.plex')
    );

    act(() => setHash('cerebrum'));
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:cerebrum')
    );
  });

  it('ignores hashchange events that point to unknown manifests', async () => {
    window.history.replaceState(null, '', '/settings#cerebrum');
    render(<SettingsPage />);
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:cerebrum')
    );

    act(() => setHash('not-a-real-section'));
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );
  });

  it('removes the hashchange listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<SettingsPage />);
    await waitFor(() => expect(screen.getAllByTestId('section-renderer')[0]).toBeInTheDocument());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });
});
