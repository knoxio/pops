/**
 * NudgesPage tests — covers loading, error, empty, and populated states.
 *
 * Bug fix #2328: error state must show an error message + Retry button,
 * not "Everything looks good".
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── tRPC mock ─────────────────────────────────────────────────────────

const mockListQuery = vi.fn();
const mockDismissMutate = vi.fn();
const mockActMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockRefetch = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      cerebrum: {
        nudges: {
          list: { invalidate: mockInvalidate },
        },
      },
    }),
    cerebrum: {
      nudges: {
        list: {
          useQuery: (...args: unknown[]) => mockListQuery(...args),
        },
        dismiss: {
          useMutation: (opts: { onSuccess?: () => void }) => ({
            mutate: (...args: unknown[]) => {
              mockDismissMutate(...args);
              opts.onSuccess?.();
            },
            isPending: false,
          }),
        },
        act: {
          useMutation: (opts: { onSuccess?: () => void }) => ({
            mutate: (...args: unknown[]) => {
              mockActMutate(...args);
              opts.onSuccess?.();
            },
            isPending: false,
          }),
        },
      },
    },
  },
}));

// ── UI mock ───────────────────────────────────────────────────────────

vi.mock('@pops/ui', async () => {
  const React = await import('react');
  return {
    Button: ({ children, onClick, disabled, ...rest }: Record<string, unknown>) =>
      React.createElement(
        'button',
        { onClick: onClick as () => void, disabled: disabled as boolean, ...rest },
        children as React.ReactNode
      ),
  };
});

// ── PriorityBadge mock ────────────────────────────────────────────────

vi.mock('../components/PriorityBadge', () => {
  const React = require('react');
  return {
    PriorityBadge: ({ priority }: { priority: string }) =>
      React.createElement('span', { 'data-testid': 'priority-badge' }, priority),
  };
});

// ── NudgeCard mock ────────────────────────────────────────────────────

vi.mock('../components/NudgeCard', () => {
  const React = require('react');
  return {
    NudgeCard: ({ nudge }: { nudge: { id: string; title: string } }) =>
      React.createElement('div', { 'data-testid': `nudge-card-${nudge.id}` }, nudge.title),
  };
});

import { NudgesPage } from './NudgesPage';

// ── Fixtures ──────────────────────────────────────────────────────────

const mockNudge = {
  id: 'nudge-001',
  type: 'staleness',
  title: 'Stale engram detected',
  body: 'This engram has not been updated in 90 days.',
  priority: 'medium',
  action: { label: 'Review' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRefetch.mockResolvedValue({});
});

// ── Tests ─────────────────────────────────────────────────────────────

describe('NudgesPage', () => {
  describe('loading state', () => {
    it('shows loading text while query is in flight', () => {
      mockListQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
      render(<NudgesPage />);
      expect(screen.getByText(/loading nudges/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('renders error message when query fails', () => {
      mockListQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { message: 'no such table: nudge_log' },
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.getByTestId('nudges-error')).toBeInTheDocument();
      expect(screen.getByText(/failed to load nudges/i)).toBeInTheDocument();
      expect(screen.getByText(/no such table: nudge_log/i)).toBeInTheDocument();
    });

    it('renders a Retry button when query fails', () => {
      mockListQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { message: 'Internal Server Error' },
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('calls refetch when Retry is clicked', async () => {
      const user = userEvent.setup();
      mockListQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { message: 'Internal Server Error' },
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      await user.click(screen.getByRole('button', { name: /retry/i }));
      expect(mockRefetch).toHaveBeenCalled();
    });

    it('does NOT show "Everything looks good" on error', () => {
      mockListQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: { message: 'Internal Server Error' },
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.queryByText(/everything looks good/i)).not.toBeInTheDocument();
    });

    it('shows fallback message when error has no message', () => {
      mockListQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: null,
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.getByText(/an unexpected error occurred/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows "Everything looks good" when there are no nudges (success)', () => {
      mockListQuery.mockReturnValue({
        data: { nudges: [], total: 0 },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.getByText(/everything looks good/i)).toBeInTheDocument();
    });
  });

  describe('populated state', () => {
    it('renders nudge cards when data is present', () => {
      mockListQuery.mockReturnValue({
        data: { nudges: [mockNudge], total: 1 },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.getByTestId('nudge-card-nudge-001')).toBeInTheDocument();
      expect(screen.getByText(/pending nudges \(1\)/i)).toBeInTheDocument();
    });

    it('shows total count in the heading', () => {
      mockListQuery.mockReturnValue({
        data: {
          nudges: [mockNudge, { ...mockNudge, id: 'nudge-002', title: 'Another nudge' }],
          total: 2,
        },
        isLoading: false,
        isError: false,
        refetch: mockRefetch,
      });
      render(<NudgesPage />);
      expect(screen.getByText(/pending nudges \(2\)/i)).toBeInTheDocument();
    });
  });
});
