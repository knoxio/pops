import { fireEvent, render, renderHook, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import { makeDraft } from './pending-import.test-helpers';
import { PendingImportCard, progressLine } from './PendingImportCard';

import type { TFunction } from 'i18next';

import type { AccountOption } from '@pops/ui';

const account: AccountOption = { id: 'acc-1', name: 'Amex', kind: 'credit-card' };
const t: TFunction<'finance'> = renderHook(() => useTranslation('finance')).result.current.t;
const NOW = '2026-09-10T02:00:00.000Z';

function renderCard(overrides: Parameters<typeof makeDraft>[0], compact = false) {
  const actions = { onOpen: vi.fn(), onTakeOver: vi.fn(), onDiscard: vi.fn() };
  render(
    <PendingImportCard
      item={{ draft: makeDraft(overrides), account }}
      actions={actions}
      compact={compact}
    />
  );
  return actions;
}

describe('progressLine', () => {
  it('says how far a saved draft got and how much is undecided', () => {
    expect(
      progressLine(makeDraft({ state: 'saved', step: 4, rowCount: 46, unresolvedCount: 3 }), t, NOW)
    ).toBe('46 transactions, stopped at Review · 3 still to decide.');
    expect(
      progressLine(
        makeDraft({ state: 'saved', step: null, rowCount: 1, unresolvedCount: 0 }),
        t,
        NOW
      )
    ).toBe('1 transaction, stopped at the start · nothing left to decide.');
  });

  it('says what arrived on a live draft and whether any of it needs a decision', () => {
    const live = makeDraft({
      state: 'live',
      source: { kind: 'live', provider: 'up' },
      rowCount: 11,
      unresolvedCount: 2,
      savedAt: '2026-09-09T22:41:00.000Z',
    });
    expect(progressLine(live, t, NOW)).toMatch(/^11 transactions arrived since .* · 2 need you\.$/);
    expect(progressLine({ ...live, unresolvedCount: 0 }, t, NOW)).toMatch(/waiting for review\.$/);
  });

  it('distinguishes a tab that is in it now from one that left days ago', () => {
    const open = makeDraft({ state: 'open', step: 4, ownerSeenAt: '2026-09-09T23:05:00.000Z' });
    expect(progressLine(open, t, NOW)).toMatch(/^Open in another tab since .*, at Review\.$/);
    const left = makeDraft({
      state: 'left-open',
      step: 5,
      ownerSeenAt: '2026-09-04T12:10:00.000Z',
    });
    expect(progressLine(left, t, NOW)).toBe(
      'Last seen 6 days ago, at Tags. The tab probably closed without saying so; taking over loses nothing.'
    );
  });

  it('shows the server reason for an unusable draft', () => {
    expect(
      progressLine(
        makeDraft({ state: 'unusable', unusableReason: 'Saved before the deploy.' }),
        t,
        NOW
      )
    ).toBe('Saved before the deploy.');
  });
});

describe('PendingImportCard', () => {
  it('a saved draft offers Resume and a quiet Discard, and names account, file and span', () => {
    const actions = renderCard({});
    expect(screen.getByText('Amex · activity_2026-08.csv')).toBeDefined();
    expect(screen.getByText('Saved')).toBeDefined();
    expect(screen.getByText(/^Covers 1 Aug 2026 – 31 Aug 2026 · saved /)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(actions.onOpen).toHaveBeenCalledWith('d1');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(actions.onDiscard).toHaveBeenCalledWith('d1');
  });

  it('a live draft offers Review only', () => {
    const actions = renderCard({ state: 'live', source: { kind: 'live', provider: 'up' } });
    expect(screen.getByText('Amex · Up live feed')).toBeDefined();
    expect(screen.getByText('Live')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(actions.onOpen).toHaveBeenCalledWith('d1');
  });

  it('an open draft offers Take over here; a left-open one, Take over', () => {
    const open = renderCard({ state: 'open', ownerSeenAt: '2026-09-10T01:00:00.000Z' });
    fireEvent.click(screen.getByRole('button', { name: 'Take over here' }));
    expect(open.onTakeOver).toHaveBeenCalledWith('d1');
  });

  it('a left-open draft reads Left open and offers Take over', () => {
    const actions = renderCard({ state: 'left-open', ownerSeenAt: '2026-09-01T01:00:00.000Z' });
    expect(screen.getByText('Left open')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Take over' }));
    expect(actions.onTakeOver).toHaveBeenCalledWith('d1');
  });

  it('an unusable draft shows the reason, no span, and Discard only', () => {
    const actions = renderCard({
      state: 'unusable',
      unusableReason: 'Saved before the 2 Sep deploy.',
    });
    expect(screen.getByText('Needs discarding')).toBeDefined();
    expect(screen.getByText('Saved before the 2 Sep deploy.')).toBeDefined();
    expect(screen.queryByText(/^Covers/)).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(actions.onDiscard).toHaveBeenCalledWith('d1');
  });

  it('compact cards drop the span line', () => {
    renderCard({}, true);
    expect(screen.queryByText(/^Covers/)).toBeNull();
  });
});
