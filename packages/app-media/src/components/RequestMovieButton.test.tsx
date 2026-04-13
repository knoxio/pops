import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfigQuery = vi.fn();
const mockGetMovieStatusQuery = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      arr: {
        getConfig: {
          useQuery: () => mockGetConfigQuery(),
        },
        getMovieStatus: {
          useQuery: (_input: unknown, _opts: unknown) => mockGetMovieStatusQuery(),
        },
      },
    },
  },
}));

// Mock the modal so tests don't need to stub its tRPC hooks
vi.mock('./RequestMovieModal', () => ({
  RequestMovieModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="request-movie-modal">Modal</div> : null,
}));

import { RequestMovieButton } from './RequestMovieButton';

describe('RequestMovieButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows disabled button when Radarr is not configured (standard)', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: false } } });
    mockGetMovieStatusQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />);

    const button = screen.getByRole('button', { name: /request/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Radarr not configured');
  });

  it('shows disabled compact button when Radarr is not configured', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: false } } });
    mockGetMovieStatusQuery.mockReturnValue({ data: null, isLoading: false, error: null });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" year={2023} variant="compact" />);

    const button = screen.getByRole('button', { name: /radarr not configured/i });
    expect(button).toBeDisabled();
  });

  it('hides button when movie exists in Radarr (available)', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'available', label: 'Available' } },
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('hides button when movie is monitored in Radarr', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'monitored', label: 'Monitored' } },
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('hides button when movie is downloading in Radarr', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'downloading', label: 'Downloading 45%' } },
      isLoading: false,
      error: null,
    });

    const { container } = render(
      <RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('returns null when Radarr is unreachable (query error)', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: new Error('Connection refused'),
    });

    const { container } = render(
      <RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows Request button when movie is not found in Radarr (standard)', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'not_found', label: 'Not in Radarr' } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />);
    expect(screen.getByRole('button', { name: /request/i })).toBeEnabled();
  });

  it('shows compact button when movie is not found in Radarr', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'not_found', label: 'Not in Radarr' } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={123} title="Test Movie" year={2023} variant="compact" />);
    expect(screen.getByRole('button', { name: /request in radarr/i })).toBeEnabled();
  });

  it('calls onRequest callback when clicked', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'not_found', label: 'Not in Radarr' } },
      isLoading: false,
      error: null,
    });

    const onRequest = vi.fn();
    render(
      <RequestMovieButton tmdbId={456} title="Test Movie" year={2020} onRequest={onRequest} />
    );

    fireEvent.click(screen.getByRole('button', { name: /request/i }));
    expect(onRequest).toHaveBeenCalledWith(456);
  });

  it('opens modal when clicked without onRequest callback', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'not_found', label: 'Not in Radarr' } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={789} title="Inception" year={2010} />);

    expect(screen.queryByTestId('request-movie-modal')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /request/i }));
    expect(screen.getByTestId('request-movie-modal')).toBeTruthy();
  });

  it('opens modal when compact button clicked without onRequest callback', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: { data: { status: 'not_found', label: 'Not in Radarr' } },
      isLoading: false,
      error: null,
    });

    render(<RequestMovieButton tmdbId={789} title="Inception" year={2010} variant="compact" />);

    expect(screen.queryByTestId('request-movie-modal')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /request in radarr/i }));
    expect(screen.getByTestId('request-movie-modal')).toBeTruthy();
  });

  it('returns null while loading', () => {
    mockGetConfigQuery.mockReturnValue({ data: { data: { radarrConfigured: true } } });
    mockGetMovieStatusQuery.mockReturnValue({
      data: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(
      <RequestMovieButton tmdbId={123} title="Test Movie" year={2023} />
    );
    expect(container.innerHTML).toBe('');
  });
});
