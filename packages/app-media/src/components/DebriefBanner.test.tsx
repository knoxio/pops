import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetPendingDebriefs = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    media: {
      comparisons: {
        getPendingDebriefs: { useQuery: () => mockGetPendingDebriefs() },
      },
    },
  },
}));

import { DebriefBanner } from './DebriefBanner';

function renderBanner() {
  return render(
    <MemoryRouter>
      <DebriefBanner />
    </MemoryRouter>
  );
}

const pendingDebrief = {
  sessionId: 42,
  movieId: 99,
  title: 'The Matrix',
  posterUrl: null,
  status: 'pending' as const,
  createdAt: '2026-03-20T00:00:00Z',
  pendingDimensionCount: 3,
};

describe('DebriefBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows count when pending debriefs exist', () => {
    mockGetPendingDebriefs.mockReturnValue({
      data: { data: [pendingDebrief] },
    });
    renderBanner();
    expect(screen.getByText('1 movie to debrief')).toBeInTheDocument();
  });

  it('shows plural count for multiple debriefs', () => {
    mockGetPendingDebriefs.mockReturnValue({
      data: {
        data: [
          pendingDebrief,
          { ...pendingDebrief, sessionId: 43, movieId: 100, title: 'Inception' },
        ],
      },
    });
    renderBanner();
    expect(screen.getByText('2 movies to debrief')).toBeInTheDocument();
  });

  it('links to first pending debrief movie', () => {
    mockGetPendingDebriefs.mockReturnValue({
      data: { data: [pendingDebrief] },
    });
    renderBanner();
    const link = screen.getByText('Start debrief');
    expect(link.closest('a')).toHaveAttribute('href', '/media/debrief/99');
  });

  it('dismiss hides banner', async () => {
    const user = userEvent.setup();
    mockGetPendingDebriefs.mockReturnValue({
      data: { data: [pendingDebrief] },
    });
    renderBanner();
    expect(screen.getByTestId('debrief-banner')).toBeInTheDocument();

    await user.click(screen.getByLabelText('Dismiss debrief banner'));
    expect(screen.queryByTestId('debrief-banner')).not.toBeInTheDocument();
  });

  it('hidden when no pending debriefs', () => {
    mockGetPendingDebriefs.mockReturnValue({
      data: { data: [] },
    });
    const { container } = renderBanner();
    expect(container.innerHTML).toBe('');
  });

  it('hidden when data is null', () => {
    mockGetPendingDebriefs.mockReturnValue({ data: null });
    const { container } = renderBanner();
    expect(container.innerHTML).toBe('');
  });
});
