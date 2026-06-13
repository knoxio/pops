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

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'glia.actions.list') return mockActionsListQuery(input);
    if (key === 'glia.trustState.list') return mockTrustListQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'glia.runPruner') {
      return { mutate: mockPrunerMutate, isPending: false, error: null };
    }
    if (key === 'glia.runConsolidator') {
      return { mutate: mockConsolidatorMutate, isPending: false, error: null };
    }
    if (key === 'glia.runLinker') {
      return { mutate: mockLinkerMutate, isPending: false, error: null };
    }
    if (key === 'glia.runAuditor') {
      return { mutate: mockAuditorMutate, isPending: false, error: null };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
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
