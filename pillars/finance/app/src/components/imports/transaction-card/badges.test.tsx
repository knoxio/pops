import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeaderBadges } from './badges';

import type { ProcessedTransaction } from '@pops/finance';

type MatchType = NonNullable<ProcessedTransaction['entity']>['matchType'];

function makeTx(
  matchType: MatchType,
  overrides: Partial<ProcessedTransaction & { manuallyEdited?: boolean }> = {}
): ProcessedTransaction & { manuallyEdited?: boolean } {
  return {
    date: '2026-04-01',
    description: 'WOOLWORTHS 1234',
    amount: -12.34,
    account: 'Everyday',
    rawRow: '{}',
    checksum: 'abc',
    location: undefined,
    entity: { matchType, confidence: 0.9, entityId: 'ent_1', entityName: 'Woolworths' },
    status: 'matched',
    ...overrides,
  };
}

describe('HeaderBadges — Auto-matched badge', () => {
  // Regression: the badge was dead because `matchType === ('auto-matched' as never)`
  // is always false. These assert the revived semantics: any automatic system match.
  it.each<MatchType>(['alias', 'exact', 'prefix', 'contains', 'ai'])(
    'shows "Auto-matched" for an automatic match (%s)',
    (matchType) => {
      render(<HeaderBadges transaction={makeTx(matchType)} />);
      expect(screen.getByText('Auto-matched')).toBeInTheDocument();
    }
  );

  it.each<MatchType>(['manual', 'none', 'learned'])(
    'does NOT show "Auto-matched" for a non-automatic match (%s)',
    (matchType) => {
      render(<HeaderBadges transaction={makeTx(matchType)} />);
      expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
    }
  );

  it('does not show "Auto-matched" when there is no matched entity', () => {
    render(<HeaderBadges transaction={makeTx('ai', { entity: undefined })} />);
    expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
  });

  it('keeps "Rule matched" separate: learned matches show Rule, not Auto', () => {
    render(<HeaderBadges transaction={makeTx('learned')} />);
    expect(screen.getByText('Rule matched')).toBeInTheDocument();
    expect(screen.queryByText('Auto-matched')).not.toBeInTheDocument();
  });
});

describe('HeaderBadges — Edited badge (store-side manuallyEdited)', () => {
  it('shows "Edited" when manuallyEdited is true', () => {
    render(<HeaderBadges transaction={makeTx('ai', { manuallyEdited: true })} />);
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('does not show "Edited" when manuallyEdited is absent', () => {
    render(<HeaderBadges transaction={makeTx('ai')} />);
    expect(screen.queryByText('Edited')).not.toBeInTheDocument();
  });
});
