import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const sdk = vi.hoisted(() => ({
  gliaActionsList: vi.fn(),
  gliaTrustStateList: vi.fn(),
  workersRunPruner: vi.fn(),
  workersRunConsolidator: vi.fn(),
  workersRunLinker: vi.fn(),
  workersRunAuditor: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

import { GliaDashboardPage } from './GliaDashboardPage';

function renderPage() {
  return render(
    withQueryClient(
      <MemoryRouter>
        <GliaDashboardPage />
      </MemoryRouter>
    )
  );
}

function buildAction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act_1',
    actionType: 'prune',
    affectedIds: ['eng_1'],
    rationale: 'stale',
    payload: null,
    phase: 'propose',
    status: 'pending',
    userDecision: 'approve',
    userNote: null,
    executedAt: null,
    decidedAt: null,
    revertedAt: null,
    createdAt: '2026-05-11T01:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.gliaTrustStateList.mockResolvedValue({ data: { states: [] } });
  sdk.workersRunPruner.mockResolvedValue({ data: { ok: true } });
  sdk.workersRunConsolidator.mockResolvedValue({ data: { ok: true } });
  sdk.workersRunLinker.mockResolvedValue({ data: { ok: true } });
  sdk.workersRunAuditor.mockResolvedValue({ data: { ok: true } });
});

describe('GliaDashboardPage', () => {
  it('renders the worker panel with run buttons', async () => {
    sdk.gliaActionsList.mockResolvedValue({ data: { actions: [], total: 0 } });
    renderPage();
    expect(await screen.findByTestId('glia-worker-pruner')).toBeInTheDocument();
    expect(screen.getByTestId('glia-worker-consolidator')).toBeInTheDocument();
    expect(screen.getByTestId('glia-worker-linker')).toBeInTheDocument();
    expect(screen.getByTestId('glia-worker-auditor')).toBeInTheDocument();
  });

  it('fires the pruner worker with dryRun by default', async () => {
    sdk.gliaActionsList.mockResolvedValue({ data: { actions: [], total: 0 } });
    renderPage();
    const prunerCard = await screen.findByTestId('glia-worker-pruner');
    const runButton = Array.from(prunerCard.querySelectorAll('button')).find((b) =>
      b.textContent?.toLowerCase().includes('run')
    );
    expect(runButton).toBeDefined();
    if (runButton) await userEvent.click(runButton);
    await waitFor(() =>
      expect(sdk.workersRunPruner).toHaveBeenCalledWith({ body: { dryRun: true } })
    );
  });

  it('shows the audit empty state when no actions exist', async () => {
    sdk.gliaActionsList.mockResolvedValue({ data: { actions: [], total: 0 } });
    renderPage();
    expect(await screen.findByTestId('glia-audit-empty')).toBeInTheDocument();
  });

  it('renders audit rows', async () => {
    sdk.gliaActionsList.mockResolvedValue({ data: { actions: [buildAction()], total: 1 } });
    renderPage();
    expect(await screen.findByTestId('glia-audit-row')).toBeInTheDocument();
  });

  it('shows a "+N more" indicator when affectedIds is truncated', async () => {
    sdk.gliaActionsList.mockResolvedValue({
      data: {
        actions: [buildAction({ affectedIds: ['eng_1', 'eng_2', 'eng_3', 'eng_4', 'eng_5'] })],
        total: 1,
      },
    });
    renderPage();
    const indicator = await screen.findByTestId('glia-audit-affected-more');
    expect(indicator.textContent).toContain('eng_1');
    expect(indicator.textContent).toContain('eng_3');
    expect(indicator.textContent).toContain('+2');
  });
});
