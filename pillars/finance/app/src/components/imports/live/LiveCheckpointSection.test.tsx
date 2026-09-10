import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ accountsList: vi.fn() }));
vi.mock('../../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => mocks.accountsList(...args),
}));

import { initialState } from '../../../store/import-store-types';
import { useImportStore } from '../../../store/importStore';
import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../../../test-utils.js';
import {
  agreementTail,
  CheckpointResultLines,
  LiveCheckpointSection,
} from './LiveCheckpointSection';

import type { ParsedTransaction } from '@pops/finance';

function parsed(date: string): ParsedTransaction {
  return {
    date,
    description: 'ROW',
    amount: -1,
    dialectAccountLabel: 'Up',
    rawRow: '{}',
    checksum: date,
  };
}

function renderWith(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.accountsList.mockResolvedValue({
    data: {
      data: [
        {
          id: 'acc-up',
          name: 'Up Spending',
          kind: 'savings',
          currency: 'AUD',
          archivedAt: null,
          displayOrder: 0,
          entityId: null,
          entityDisplayName: null,
          entityDisplayNameStale: false,
          entityColour: null,
          entityAvatarAssetId: null,
          resolvedEntityId: null,
          balance: NO_BALANCE,
          importStatus: NO_IMPORT_STATUS,
          transactionCount: NO_TRANSACTION_COUNT,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  useImportStore.setState({ ...initialState });
});

describe('LiveCheckpointSection', () => {
  it('names the reported balance and the newest row date for a live draft', async () => {
    useImportStore.setState({
      draftSource: { kind: 'live', provider: 'up' },
      draftBalanceCents: 61_215,
      accountId: 'acc-up',
      parsedTransactions: [parsed('2026-09-02'), parsed('2026-09-04'), parsed('2026-09-03')],
    });
    renderWith(<LiveCheckpointSection />);
    expect(screen.getByText('Balance checkpoint')).toBeDefined();
    expect(await screen.findByText('$612.15')).toBeDefined();
    expect(screen.getByText(/on 4 Sept? 2026\./)).toBeDefined();
  });

  it('renders nothing for a file draft, or a live draft with no reported balance', () => {
    useImportStore.setState({ draftBalanceCents: 100, parsedTransactions: [parsed('2026-09-02')] });
    const { container, unmount } = renderWith(<LiveCheckpointSection />);
    expect(container.textContent).toBe('');
    unmount();
    useImportStore.setState({
      draftSource: { kind: 'live', provider: 'up' },
      draftBalanceCents: null,
      parsedTransactions: [parsed('2026-09-02')],
    });
    expect(renderWith(<LiveCheckpointSection />).container.textContent).toBe('');
  });
});

describe('CheckpointResultLines', () => {
  it('says the ledger agrees, or by how much it is off', async () => {
    const base = {
      id: 'c1',
      accountId: 'acc-up',
      balanceCents: 1,
      currency: 'AUD',
      asOf: '2026-09-04',
    };
    expect(agreementTail({ ...base, deltaCents: 0 })).toBe(' · the ledger agrees.');
    expect(agreementTail({ ...base, deltaCents: -250 })).toBe(' · the ledger is off by $2.50.');
    renderWith(
      <CheckpointResultLines
        checkpoints={[
          {
            id: 'c1',
            accountId: 'acc-up',
            balanceCents: 61_215,
            currency: 'AUD',
            asOf: '2026-09-04',
            deltaCents: 0,
          },
        ]}
      />
    );
    expect(
      await screen.findByText(
        /Checkpoint recorded: \$612\.15 as of 4 Sept? 2026 · the ledger agrees\./
      )
    ).toBeDefined();
  });

  it('renders nothing with no checkpoints', () => {
    expect(renderWith(<CheckpointResultLines checkpoints={[]} />).container.textContent).toBe('');
  });
});
