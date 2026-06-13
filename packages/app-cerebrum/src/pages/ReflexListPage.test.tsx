import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockListQuery = vi.fn();
const mockEnableMutate = vi.fn();
const mockDisableMutate = vi.fn();
const mockTestMutate = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'reflex.list') return mockListQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'reflex.enable') {
      return { mutate: mockEnableMutate, isPending: false, error: null };
    }
    if (key === 'reflex.disable') {
      return { mutate: mockDisableMutate, isPending: false, error: null };
    }
    if (key === 'reflex.test') {
      return { mutate: mockTestMutate, isPending: false, error: null };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
}));

import { ReflexListPage } from './ReflexListPage';

import type { ReflexWithStatus } from '../reflex/types';

function buildReflex(overrides: Partial<ReflexWithStatus> = {}): ReflexWithStatus {
  return {
    name: 'consolidate-notes',
    description: 'Consolidates similar notes',
    enabled: true,
    trigger: { type: 'event', event: 'engram.created' },
    action: { type: 'glia', verb: 'consolidate' },
    lastExecutionAt: '2026-05-11T01:00:00Z',
    nextFireTime: null,
    executionCount: 3,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReflexListPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ReflexListPage', () => {
  it('renders the loading skeleton while the list query is in flight', () => {
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('reflex-loading')).toBeInTheDocument();
  });

  it('renders the empty state when no reflexes are configured', () => {
    mockListQuery.mockReturnValue({
      data: { reflexes: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No reflexes configured')).toBeInTheDocument();
  });

  it('renders an error state with retry when the query fails', async () => {
    const refetch = vi.fn();
    mockListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'boom' },
      refetch,
    });
    renderPage();
    expect(screen.getByTestId('reflex-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('lists reflex rows and fires the test mutation on demand', async () => {
    mockListQuery.mockReturnValue({
      data: {
        reflexes: [buildReflex(), buildReflex({ name: 'nightly-summary', enabled: false })],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getAllByTestId('reflex-row')).toHaveLength(2);
    const targetRow = screen.getByText('consolidate-notes').closest('[data-testid="reflex-row"]');
    expect(targetRow).toBeTruthy();
    if (!(targetRow instanceof HTMLElement)) {
      throw new Error('Expected reflex-row for consolidate-notes');
    }
    await userEvent.click(within(targetRow).getByRole('button', { name: /fire/i }));
    expect(mockTestMutate).toHaveBeenCalledWith({ name: 'consolidate-notes' });
  });

  it('toggles enable and disable mutations from the row switch', async () => {
    mockListQuery.mockReturnValue({
      data: {
        reflexes: [
          buildReflex({ name: 'a', enabled: true }),
          buildReflex({ name: 'b', enabled: false }),
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    const rowA = screen.getByText('a').closest('[data-testid="reflex-row"]');
    const rowB = screen.getByText('b').closest('[data-testid="reflex-row"]');
    if (!(rowA instanceof HTMLElement) || !(rowB instanceof HTMLElement)) {
      throw new Error('Expected reflex-row elements for a and b');
    }
    await userEvent.click(within(rowA).getByRole('switch'));
    expect(mockDisableMutate).toHaveBeenCalledWith({ name: 'a' });
    await userEvent.click(within(rowB).getByRole('switch'));
    expect(mockEnableMutate).toHaveBeenCalledWith({ name: 'b' });
  });
});
