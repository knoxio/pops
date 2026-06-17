import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const qualityProfilesMock = vi.hoisted(() => vi.fn());
const rootFoldersMock = vi.hoisted(() => vi.fn());
const addMovieMock = vi.hoisted(() => vi.fn());
const downloadAndProtectMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  arrGetRadarrQualityProfiles: (...args: unknown[]) => qualityProfilesMock(...args),
  arrGetRadarrRootFolders: (...args: unknown[]) => rootFoldersMock(...args),
  arrAddMovie: (...args: unknown[]) => addMovieMock(...args),
  arrDownloadAndProtect: (...args: unknown[]) => downloadAndProtectMock(...args),
}));

import { RequestMovieModal } from './RequestMovieModal';

const profiles = [
  { id: 1, name: 'HD - 720p/1080p' },
  { id: 2, name: 'Ultra-HD' },
];

const folders = [
  { id: 1, path: '/movies', freeSpace: 500 * 1024 * 1024 * 1024 },
  { id: 2, path: '/movies2', freeSpace: 100 * 1024 * 1024 * 1024 },
];

function ok<T>(data: T) {
  return { data, error: undefined };
}

function setupDefaults(
  overrides: { profileList?: typeof profiles; folderList?: typeof folders } = {}
) {
  const { profileList = profiles, folderList = folders } = overrides;
  qualityProfilesMock.mockResolvedValue(ok({ data: profileList }));
  rootFoldersMock.mockResolvedValue(ok({ data: folderList }));
}

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  tmdbId: 550,
  title: 'Fight Club',
  year: 1999,
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderModal(props = {}) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<RequestMovieModal {...defaultProps} {...props} />, { wrapper });
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
  addMovieMock.mockResolvedValue(ok({ data: { id: 1, title: 'Fight Club', tmdbId: 550 } }));
  downloadAndProtectMock.mockResolvedValue(ok({ data: {} }));
});

describe('RequestMovieModal', () => {
  it('shows movie title and year in header', () => {
    renderModal();

    expect(screen.getByText('Request Movie')).toBeInTheDocument();
    expect(screen.getByText('Fight Club (1999)')).toBeInTheDocument();
  });

  it('populates quality profile dropdown from API', async () => {
    renderModal();

    await waitFor(() => {
      const select = document.querySelector('#quality-profile') as HTMLSelectElement | null;
      expect(select?.querySelectorAll('option')).toHaveLength(2);
    });
    const select = document.querySelector('#quality-profile') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options[0]!.textContent).toBe('HD - 720p/1080p');
    expect(options[1]!.textContent).toBe('Ultra-HD');
  });

  it('populates root folder dropdown with free space', async () => {
    renderModal();

    await waitFor(() => {
      const select = document.querySelector('#root-folder') as HTMLSelectElement | null;
      expect(select?.querySelectorAll('option')).toHaveLength(2);
    });
    const select = document.querySelector('#root-folder') as HTMLSelectElement;
    const options = select.querySelectorAll('option');
    expect(options[0]!.textContent).toContain('/movies');
    expect(options[0]!.textContent).toContain('GB free');
  });

  it('sends correct addMovie payload on confirm', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      const select = document.querySelector('#root-folder') as HTMLSelectElement | null;
      expect(select?.value).toBe('/movies');
    });
    await user.click(screen.getByText('Request'));

    await waitFor(() =>
      expect(addMovieMock).toHaveBeenCalledWith({
        body: {
          tmdbId: 550,
          title: 'Fight Club',
          year: 1999,
          qualityProfileId: 1,
          rootFolderPath: '/movies',
        },
      })
    );
  });

  it('calls onClose after successful add', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await waitFor(() => {
      const select = document.querySelector('#root-folder') as HTMLSelectElement | null;
      expect(select?.value).toBe('/movies');
    });
    await user.click(screen.getByText('Request'));

    expect(await screen.findByText('Movie Added')).toBeInTheDocument();
    // The modal intentionally waits 1500ms on the success state before closing.
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('shows inline error on failure', async () => {
    addMovieMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Movie already exists in Radarr' },
      response: { status: 409 },
    });
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => {
      const select = document.querySelector('#root-folder') as HTMLSelectElement | null;
      expect(select?.value).toBe('/movies');
    });
    await user.click(screen.getByText('Request'));

    expect(await screen.findByText('Movie already exists in Radarr')).toBeInTheDocument();
  });

  it('calls onClose on cancel without API call', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(addMovieMock).not.toHaveBeenCalled();
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

  it('shows retry when no root folders available', async () => {
    setupDefaults({ folderList: [] });
    renderModal();

    expect(await screen.findByText(/No root folders found/)).toBeInTheDocument();
  });

  it('defaults to first quality profile and root folder', async () => {
    renderModal();

    await waitFor(() => {
      const profileSelect = document.querySelector('#quality-profile') as HTMLSelectElement | null;
      expect(profileSelect?.value).toBe('1');
    });
    const folderSelect = document.querySelector('#root-folder') as HTMLSelectElement;
    expect(folderSelect.value).toBe('/movies');
  });

  describe('mode="download"', () => {
    it('shows "Download Movie" title', () => {
      renderModal({ mode: 'download' });

      expect(screen.getByText('Download Movie')).toBeInTheDocument();
      expect(screen.queryByText('Request Movie')).not.toBeInTheDocument();
    });

    it('does not show quality profile or root folder dropdowns', () => {
      renderModal({ mode: 'download' });

      expect(document.querySelector('#quality-profile')).toBeNull();
      expect(document.querySelector('#root-folder')).toBeNull();
    });

    it('calls downloadAndProtect (not addMovie) on confirm', async () => {
      const user = userEvent.setup();
      renderModal({ mode: 'download' });

      await user.click(screen.getByText('Download'));

      await waitFor(() =>
        expect(downloadAndProtectMock).toHaveBeenCalledWith({
          body: { tmdbId: 550, title: 'Fight Club', year: 1999 },
        })
      );
      expect(addMovieMock).not.toHaveBeenCalled();
    });

    it('calls onClose after successful download', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderModal({ mode: 'download', onClose });

      await user.click(screen.getByText('Download'));

      expect(await screen.findByText('Movie Downloaded')).toBeInTheDocument();
      // The modal intentionally waits 1500ms on the success state before closing.
      await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
    });

    it('shows inline error on download failure', async () => {
      downloadAndProtectMock.mockResolvedValue({
        data: undefined,
        error: { message: 'Download failed' },
        response: { status: 500 },
      });
      const user = userEvent.setup();
      renderModal({ mode: 'download' });

      await user.click(screen.getByText('Download'));

      expect(await screen.findByText('Download failed')).toBeInTheDocument();
    });
  });
});
