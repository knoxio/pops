/**
 * SettingsPage tests — hash-based deep linking and post-mount navigation.
 *
 * Issue: #2464 — hash changes after initial mount must update the active group
 * (back/forward, address-bar edits, programmatic `window.location.hash = '...'`).
 *
 * settings-federation S3: the page now reads sections from the LIVE registry
 * via `useSettingsSections` (`discoverSettings` over the snapshot). Tests mock
 * that hook to inject a deterministic section list.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SettingsSection } from './settings-page/useSettingsSections';

const mocks = vi.hoisted(() => ({
  sections: [
    {
      manifest: { id: 'finance', title: 'Finance', order: 0, groups: [] },
      ownerPillar: 'finance',
      hasFederatedSettings: true,
    },
    {
      manifest: { id: 'media.plex', title: 'Plex', order: 1, groups: [] },
      ownerPillar: 'media',
      hasFederatedSettings: true,
    },
    {
      manifest: { id: 'cerebrum', title: 'Cerebrum', order: 2, groups: [] },
      ownerPillar: 'cerebrum',
      hasFederatedSettings: false,
    },
  ] satisfies SettingsSection[],
  useSettingsSections: vi.fn(),
}));

vi.mock('./settings-page/useSettingsSections', () => ({
  useSettingsSections: mocks.useSettingsSections,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/settings/SectionRenderer', () => ({
  SectionRenderer: ({
    manifest,
    ownerPillar,
    hasFederatedSettings,
  }: {
    manifest: { id: string };
    ownerPillar?: string;
    hasFederatedSettings?: boolean;
  }) => (
    <div data-testid="section-renderer">
      section:{manifest.id}|owner:{ownerPillar}|fed:{String(hasFederatedSettings)}
    </div>
  ),
}));

import { SettingsPage } from './SettingsPage';

function renderPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

function setHash(hash: string) {
  window.history.replaceState(null, '', `#${hash}`);
  fireEvent(window, new HashChangeEvent('hashchange'));
}

describe('SettingsPage hash-based deep linking', () => {
  beforeEach(() => {
    mocks.useSettingsSections.mockReturnValue({ data: mocks.sections, isLoading: false });
    window.history.replaceState(null, '', '/settings');
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/settings');
  });

  it('uses the initial hash to pick the active group on mount', async () => {
    window.history.replaceState(null, '', '/settings#cerebrum');
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:cerebrum')
    );
  });

  it('falls back to the first manifest when the hash is empty', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );
  });

  it('falls back to the first manifest when the hash is unknown', async () => {
    window.history.replaceState(null, '', '/settings#does-not-exist');
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );
  });

  it('routes each section to its owning pillar with the live capability flag', async () => {
    window.history.replaceState(null, '', '/settings#finance');
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent(
        'section:finance|owner:finance|fed:true'
      )
    );

    act(() => setHash('cerebrum'));
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent(
        'section:cerebrum|owner:cerebrum|fed:false'
      )
    );
  });

  it('updates the active group when the hash changes after mount', async () => {
    window.history.replaceState(null, '', '/settings#finance');
    renderPage();
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
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:cerebrum')
    );

    act(() => setHash('not-a-real-section'));
    await waitFor(() =>
      expect(screen.getAllByTestId('section-renderer')[0]).toHaveTextContent('section:finance')
    );
  });

  it('renders the empty state when the registry contributes no sections', async () => {
    mocks.useSettingsSections.mockReturnValue({ data: [], isLoading: false });
    renderPage();
    await waitFor(() => expect(screen.queryByTestId('section-renderer')).toBeNull());
  });

  it('removes the hashchange listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <SettingsPage />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getAllByTestId('section-renderer')[0]).toBeInTheDocument());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });
});
