import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockActionsListQuery = vi.fn();
const mockTrustListQuery = vi.fn();
const mockPrunerMutate = vi.fn();
const mockConsolidatorMutate = vi.fn();
const mockLinkerMutate = vi.fn();
const mockAuditorMutate = vi.fn();
const invalidateActions = vi.fn().mockResolvedValue(undefined);

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      cerebrum: { glia: { actions: { list: { invalidate: invalidateActions } } } },
    }),
    cerebrum: {
      glia: {
        actions: {
          list: { useQuery: (...args: unknown[]) => mockActionsListQuery(...args) },
        },
        trustState: {
          list: { useQuery: (...args: unknown[]) => mockTrustListQuery(...args) },
        },
        runPruner: {
          useMutation: () => ({
            mutate: mockPrunerMutate,
            isPending: false,
            error: null,
          }),
        },
        runConsolidator: {
          useMutation: () => ({
            mutate: mockConsolidatorMutate,
            isPending: false,
            error: null,
          }),
        },
        runLinker: {
          useMutation: () => ({
            mutate: mockLinkerMutate,
            isPending: false,
            error: null,
          }),
        },
        runAuditor: {
          useMutation: () => ({
            mutate: mockAuditorMutate,
            isPending: false,
            error: null,
          }),
        },
      },
    },
  },
}));

import { GliaDashboardPage } from './GliaDashboardPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <GliaDashboardPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTrustListQuery.mockReturnValue({ data: { states: [] }, isLoading: false });
});

describe('GliaDashboardPage', () => {
  it('renders the worker panel with run buttons', () => {
    mockActionsListQuery.mockReturnValue({
      data: { actions: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('glia-worker-pruner')).toBeInTheDocument();
    expect(screen.getByTestId('glia-worker-consolidator')).toBeInTheDocument();
    expect(screen.getByTestId('glia-worker-linker')).toBeInTheDocument();
    expect(screen.getByTestId('glia-worker-auditor')).toBeInTheDocument();
  });

  it('fires the pruner mutation with dryRun by default', async () => {
    mockActionsListQuery.mockReturnValue({
      data: { actions: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    const prunerCard = screen.getByTestId('glia-worker-pruner');
    const runButton = Array.from(prunerCard.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('run')
    );
    expect(runButton).toBeDefined();
    if (runButton) await userEvent.click(runButton);
    expect(mockPrunerMutate).toHaveBeenCalledWith(
      { dryRun: true },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('shows the audit empty state when no actions exist', () => {
    mockActionsListQuery.mockReturnValue({
      data: { actions: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('glia-audit-empty')).toBeInTheDocument();
  });

  it('renders audit rows', () => {
    mockActionsListQuery.mockReturnValue({
      data: {
        actions: [
          {
            id: 'act_1',
            actionType: 'prune',
            affectedIds: ['eng_1'],
            rationale: 'stale',
            payload: null,
            phase: 'propose',
            status: 'pending',
            userDecision: null,
            userNote: null,
            executedAt: null,
            decidedAt: null,
            revertedAt: null,
            createdAt: '2026-05-11T01:00:00Z',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('glia-audit-row')).toBeInTheDocument();
  });

  it('shows a "+N more" indicator when affectedIds is truncated', () => {
    mockActionsListQuery.mockReturnValue({
      data: {
        actions: [
          {
            id: 'act_1',
            actionType: 'prune',
            affectedIds: ['eng_1', 'eng_2', 'eng_3', 'eng_4', 'eng_5'],
            rationale: 'stale',
            payload: null,
            phase: 'propose',
            status: 'pending',
            userDecision: null,
            userNote: null,
            executedAt: null,
            decidedAt: null,
            revertedAt: null,
            createdAt: '2026-05-11T01:00:00Z',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    // 5 affectedIds → first 3 visible + "+2 more" indicator.
    const indicator = screen.getByTestId('glia-audit-affected-more');
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent).toContain('eng_1');
    expect(indicator.textContent).toContain('eng_3');
    expect(indicator.textContent).toContain('+2');
  });
});
