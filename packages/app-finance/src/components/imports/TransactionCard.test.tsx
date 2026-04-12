import type { ProcessedTransaction } from '@pops/api/modules/finance/imports';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TransactionCard } from './TransactionCard';

function makeTx(overrides: Partial<ProcessedTransaction> = {}): ProcessedTransaction {
  return {
    date: '2026-04-01',
    description: 'WOOLWORTHS 1234',
    amount: -12.34,
    account: 'Everyday',
    rawRow: '{}',
    checksum: 'abc',
    location: undefined,
    entity: { matchType: 'learned', confidence: 0.92, entityId: 'ent_1', entityName: 'Woolworths' },
    status: 'matched',
    ruleProvenance: {
      source: 'correction',
      ruleId: 'corr_123',
      pattern: 'WOOLWORTHS',
      matchType: 'contains',
      confidence: 0.92,
    },
    ...overrides,
  };
}

describe('TransactionCard rule provenance', () => {
  it('renders the Rule matched badge and details when ruleProvenance is present', () => {
    render(<TransactionCard transaction={makeTx()} readonly={true} variant="matched" />);

    expect(screen.getByText('Rule matched')).toBeInTheDocument();
    expect(screen.getByText(/contains/i)).toBeInTheDocument();
    expect(screen.getByText(/92%/i)).toBeInTheDocument();
    expect(screen.getByText('WOOLWORTHS')).toBeInTheDocument();
  });

  it('renders provenance for uncertain transactions too', () => {
    render(
      <TransactionCard
        transaction={makeTx({ status: 'uncertain' })}
        readonly={true}
        variant="uncertain"
      />
    );

    expect(screen.getByText('Rule matched')).toBeInTheDocument();
    expect(screen.getByText('WOOLWORTHS')).toBeInTheDocument();
  });

  it('does not render the badge when not rule matched', () => {
    render(
      <TransactionCard
        transaction={makeTx({
          ruleProvenance: undefined,
          entity: { matchType: 'exact', entityId: 'ent_1', entityName: 'Woolworths' },
        })}
        readonly={true}
        variant="matched"
      />
    );

    expect(screen.queryByText('Rule matched')).toBeNull();
  });
});
