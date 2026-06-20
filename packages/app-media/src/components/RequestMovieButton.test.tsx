import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const arrConfigMock = vi.hoisted(() => vi.fn());
const arrGetMovieStatusMock = vi.hoisted(() => vi.fn());

vi.mock('../media-api/index.js', () => ({
  arrConfig: (...args: unknown[]) => arrConfigMock(...args),
  arrGetMovieStatus: (...args: unknown[]) => arrGetMovieStatusMock(...args),
}));

// Mock the modal so tests don't need to stub its SDK calls
vi.mock('./RequestMovieModal', () => ({
  RequestMovieModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="request-movie-modal">Modal</div> : null,
}));

import { RequestMovieButton } from './RequestMovieButton';

function ok<T>(data: T) {
  return { data, error: undefined };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderButton(props: Parameters<typeof RequestMovieButton>[0]) {
  const queryClient = makeQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return render(<RequestMovieButton {...props} />, { wrapper });
}

function configured(radarrConfigured: boolean) {
  arrConfigMock.mockResolvedValue(ok({ data: { radarrConfigured, sonarrConfigured: false } }));
}

function movieStatus(status: string, label: string) {
  arrGetMovieStatusMock.mockResolvedValue(ok({ data: { status, label } }));
}

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  vi.clearAllMocks();
  configured(true);
  movieStatus('not_found', 'Not in Radarr');
});

describe('RequestMovieButton', () => {
  it('shows disabled button when Radarr is not configured (standard)', async () => {
    configured(false);

    renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });

    await waitFor(() => expect(arrConfigMock).toHaveBeenCalled());
    const button = screen.getByRole('button', { name: /request/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Radarr not configured');
  });

  it('shows disabled compact button when Radarr is not configured', async () => {
    configured(false);

    renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023, variant: 'compact' });

    await waitFor(() => expect(arrConfigMock).toHaveBeenCalled());
    const button = screen.getByRole('button', { name: /radarr not configured/i });
    expect(button).toBeDisabled();
  });

  it('hides button when movie exists in Radarr (available)', async () => {
    movieStatus('available', 'Available');

    const { container } = renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });
    await waitFor(() => expect(arrGetMovieStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('hides button when movie is monitored in Radarr', async () => {
    movieStatus('monitored', 'Monitored');

    const { container } = renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });
    await waitFor(() => expect(arrGetMovieStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('hides button when movie is downloading in Radarr', async () => {
    movieStatus('downloading', 'Downloading 45%');

    const { container } = renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });
    await waitFor(() => expect(arrGetMovieStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('returns null when Radarr is unreachable (query error)', async () => {
    arrGetMovieStatusMock.mockResolvedValue({
      data: undefined,
      error: { message: 'Connection refused' },
      response: { status: 500 },
    });

    const { container } = renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });
    await waitFor(() => expect(arrGetMovieStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });

  it('shows Request button when movie is not found in Radarr (standard)', async () => {
    renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });
    const button = await screen.findByTitle('Request in Radarr');
    expect(button).toBeEnabled();
  });

  it('shows compact button when movie is not found in Radarr', async () => {
    renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023, variant: 'compact' });
    const button = await screen.findByRole('button', { name: /request in radarr/i });
    expect(button).toBeEnabled();
  });

  it('calls onRequest callback when clicked', async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();
    renderButton({ tmdbId: 456, title: 'Test Movie', year: 2020, onRequest });

    await user.click(await screen.findByTitle('Request in Radarr'));
    expect(onRequest).toHaveBeenCalledWith(456);
  });

  it('opens modal when clicked without onRequest callback', async () => {
    const user = userEvent.setup();
    renderButton({ tmdbId: 789, title: 'Inception', year: 2010 });

    const button = await screen.findByTitle('Request in Radarr');
    expect(screen.queryByTestId('request-movie-modal')).toBeNull();
    await user.click(button);
    expect(await screen.findByTestId('request-movie-modal')).toBeTruthy();
  });

  it('opens modal when compact button clicked without onRequest callback', async () => {
    const user = userEvent.setup();
    renderButton({ tmdbId: 789, title: 'Inception', year: 2010, variant: 'compact' });

    const button = await screen.findByRole('button', { name: /request in radarr/i });
    expect(screen.queryByTestId('request-movie-modal')).toBeNull();
    await user.click(button);
    expect(await screen.findByTestId('request-movie-modal')).toBeTruthy();
  });

  it('returns null while the status query is loading', async () => {
    arrGetMovieStatusMock.mockReturnValue(new Promise(() => {}));

    const { container } = renderButton({ tmdbId: 123, title: 'Test Movie', year: 2023 });
    // Config resolves (radarr configured) so the "not configured" placeholder goes away,
    // then the pending status query leaves nothing rendered.
    await waitFor(() => expect(arrGetMovieStatusMock).toHaveBeenCalled());
    await waitFor(() => expect(container.innerHTML).toBe(''));
  });
});
