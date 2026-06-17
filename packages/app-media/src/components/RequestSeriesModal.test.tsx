import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const qualityProfilesMock = vi.hoisted(() => vi.fn());
const rootFoldersMock = vi.hoisted(() => vi.fn());
const languageProfilesMock = vi.hoisted(() => vi.fn());
const addSeriesMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  arrGetSonarrQualityProfiles: (...args: unknown[]) => qualityProfilesMock(...args),
  arrGetSonarrRootFolders: (...args: unknown[]) => rootFoldersMock(...args),
  arrGetSonarrLanguageProfiles: (...args: unknown[]) => languageProfilesMock(...args),
  arrAddSeries: (...args: unknown[]) => addSeriesMock(...args),
}));

import { RequestSeriesModal } from './RequestSeriesModal';

import type { SeasonInfo } from './RequestSeriesModal';

const profiles = [
  { id: 1, name: 'HD - 720p/1080p' },
  { id: 2, name: 'Ultra-HD' },
];

const folders = [
  { id: 1, path: '/tv', freeSpace: 800 * 1024 * 1024 * 1024 },
  { id: 2, path: '/tv2', freeSpace: 200 * 1024 * 1024 * 1024 },
];

const languageProfiles = [
  { id: 1, name: 'English' },
  { id: 2, name: 'Any' },
];

const pastSeasons: SeasonInfo[] = [
  { seasonNumber: 1, firstAirDate: '2020-01-15' },
  { seasonNumber: 2, firstAirDate: '2021-03-20' },
];

const futureSeasons: SeasonInfo[] = [
  { seasonNumber: 3, firstAirDate: '2028-06-01' },
  { seasonNumber: 4, firstAirDate: null },
];

const mixedSeasons: SeasonInfo[] = [...pastSeasons, ...futureSeasons];

function ok<T>(data: T) {
  return { data, error: undefined };
}

function setupDefaults(
  overrides: {
    profileList?: typeof profiles;
    folderList?: typeof folders;
    languageList?: typeof languageProfiles;
  } = {}
) {
  const {
    profileList = profiles,
    folderList = folders,
    languageList = languageProfiles,
  } = overrides;
  qualityProfilesMock.mockResolvedValue(ok({ data: profileList }));
  rootFoldersMock.mockResolvedValue(ok({ data: folderList }));
  languageProfilesMock.mockResolvedValue(ok({ data: languageList }));
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  tvdbId: 81189,
  title: 'Breaking Bad',
  year: 2008,
  seasons: mixedSeasons,
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderModal(props: Partial<typeof defaultProps> = {}) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<RequestSeriesModal {...defaultProps} {...props} />, { wrapper });
}

/** Resolves once the option dropdowns have hydrated from the SDK mocks. */
async function awaitFormReady() {
  await waitFor(() => {
    const select = document.querySelector('#language-profile') as HTMLSelectElement | null;
    expect(select?.value).toBe('1');
  });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
  addSeriesMock.mockResolvedValue(ok({ data: { id: 1 } }));
});

describe('RequestSeriesModal', () => {
  it('shows series title and year in header', () => {
    renderModal();

    expect(screen.getByText('Request Series')).toBeInTheDocument();
    expect(screen.getByText('Breaking Bad (2008)')).toBeInTheDocument();
  });

  it('populates quality profile dropdown from API', async () => {
    renderModal();

    await awaitFormReady();
    const select = document.querySelector('#quality-profile') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toBe('HD - 720p/1080p');
    expect(options[1]!.textContent).toBe('Ultra-HD');
  });

  it('populates root folder dropdown with free space', async () => {
    renderModal();

    await awaitFormReady();
    const select = document.querySelector('#root-folder') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain('/tv');
    expect(options[0]!.textContent).toContain('GB free');
  });

  it('populates language profile dropdown from API', async () => {
    renderModal();

    await awaitFormReady();
    const select = document.querySelector('#language-profile') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toBe('English');
    expect(options[1]!.textContent).toBe('Any');
  });

  it('defaults to first quality profile, root folder, and language profile', async () => {
    renderModal();

    await awaitFormReady();
    expect((document.querySelector('#quality-profile') as HTMLSelectElement).value).toBe('1');
    expect((document.querySelector('#root-folder') as HTMLSelectElement).value).toBe('/tv');
    expect((document.querySelector('#language-profile') as HTMLSelectElement).value).toBe('1');
  });

  it('applies smart season defaults — future checked, past unchecked', async () => {
    renderModal();

    await awaitFormReady();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).not.toBeChecked(); // Season 1
    expect(checkboxes[1]).not.toBeChecked(); // Season 2
    expect(checkboxes[2]).toBeChecked(); // Season 3
    expect(checkboxes[3]).toBeChecked(); // Season 4
  });

  it('allows toggling individual season checkboxes', async () => {
    const user = userEvent.setup();
    renderModal();

    await awaitFormReady();
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    expect(checkboxes[0]!).toBeChecked();
    await user.click(checkboxes[2]!);
    expect(checkboxes[2]!).not.toBeChecked();
  });

  it('shows Select All / Deselect All when more than 3 seasons', async () => {
    renderModal();

    await awaitFormReady();
    expect(screen.getByText('Select All')).toBeInTheDocument();
    expect(screen.getByText('Deselect All')).toBeInTheDocument();
  });

  it('does not show bulk controls when 3 or fewer seasons', async () => {
    renderModal({ seasons: pastSeasons });

    await awaitFormReady();
    expect(screen.queryByText('Select All')).not.toBeInTheDocument();
    expect(screen.queryByText('Deselect All')).not.toBeInTheDocument();
  });

  it('Select All checks all seasons', async () => {
    const user = userEvent.setup();
    renderModal();

    await awaitFormReady();
    await user.click(screen.getByText('Select All'));

    for (const cb of screen.getAllByRole('checkbox')) {
      expect(cb).toBeChecked();
    }
  });

  it('Deselect All unchecks all seasons', async () => {
    const user = userEvent.setup();
    renderModal();

    await awaitFormReady();
    await user.click(screen.getByText('Deselect All'));

    for (const cb of screen.getAllByRole('checkbox')) {
      expect(cb).not.toBeChecked();
    }
  });

  it('sends correct addSeries payload on confirm', async () => {
    const user = userEvent.setup();
    renderModal();

    await awaitFormReady();
    await user.click(screen.getByText('Request'));

    await waitFor(() =>
      expect(addSeriesMock).toHaveBeenCalledWith({
        body: {
          tvdbId: 81189,
          title: 'Breaking Bad',
          qualityProfileId: 1,
          rootFolderPath: '/tv',
          languageProfileId: 1,
          seasons: [
            { seasonNumber: 1, monitored: false },
            { seasonNumber: 2, monitored: false },
            { seasonNumber: 3, monitored: true },
            { seasonNumber: 4, monitored: true },
          ],
        },
      })
    );
  });

  it('calls onClose after successful add', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await awaitFormReady();
    await user.click(screen.getByText('Request'));

    expect(await screen.findByText('Series Added')).toBeInTheDocument();
    // The modal intentionally waits 1500ms on the success state before closing.
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('shows inline error on failure', async () => {
    addSeriesMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Series already exists in Sonarr' },
      response: { status: 409 },
    });
    const user = userEvent.setup();
    renderModal();

    await awaitFormReady();
    await user.click(screen.getByText('Request'));

    expect(await screen.findByText('Series already exists in Sonarr')).toBeInTheDocument();
  });

  it('calls onClose on cancel without API call', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(addSeriesMock).not.toHaveBeenCalled();
  });

  it('shows loading state while fetching options', () => {
    qualityProfilesMock.mockReturnValue(new Promise(() => {}));
    renderModal();

    expect(screen.getByText('Loading options...')).toBeInTheDocument();
  });

  it('shows retry when no profiles available', async () => {
    setupDefaults({ profileList: [] });
    renderModal();

    expect(await screen.findByText(/No quality profiles found/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows retry when no language profiles available', async () => {
    setupDefaults({ languageList: [] });
    renderModal();

    expect(await screen.findByText(/No language profiles found/)).toBeInTheDocument();
  });

  it('displays season year from firstAirDate', async () => {
    renderModal();

    await awaitFormReady();
    expect(screen.getByText('— 2020')).toBeInTheDocument();
    expect(screen.getByText('— 2028')).toBeInTheDocument();
  });

  it('displays Specials for season 0', async () => {
    renderModal({ seasons: [{ seasonNumber: 0, firstAirDate: '2019-01-01' }] });

    await awaitFormReady();
    expect(screen.getByText('Specials')).toBeInTheDocument();
  });
});
