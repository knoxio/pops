import { describe, expect, it } from 'vitest';

import { daysBetween, joinPendingAccounts, sortPending, sourceLabel } from './pending-import-view';
import { makeDraft } from './pending-import.test-helpers';

import type { AccountOption } from '@pops/ui';

const account: AccountOption = { id: 'acc-1', name: 'Amex', kind: 'credit-card' };

describe('sortPending', () => {
  it('deals unusable first, then open or left-open, live, saved, newest saved first within a state', () => {
    const items = [
      { draft: makeDraft({ id: 'saved-old', state: 'saved', savedAt: '2026-09-01T00:00:00Z' }) },
      { draft: makeDraft({ id: 'live', state: 'live' }) },
      { draft: makeDraft({ id: 'saved-new', state: 'saved', savedAt: '2026-09-05T00:00:00Z' }) },
      { draft: makeDraft({ id: 'left', state: 'left-open', savedAt: '2026-09-02T00:00:00Z' }) },
      { draft: makeDraft({ id: 'unusable', state: 'unusable' }) },
      { draft: makeDraft({ id: 'open', state: 'open', savedAt: '2026-09-03T00:00:00Z' }) },
    ];
    expect(sortPending(items).map((i) => i.draft.id)).toEqual([
      'unusable',
      'open',
      'left',
      'live',
      'saved-new',
      'saved-old',
    ]);
  });

  it('does not mutate its input', () => {
    const items = [
      { draft: makeDraft({ id: 'b', state: 'saved' }) },
      { draft: makeDraft({ id: 'a', state: 'unusable' }) },
    ];
    sortPending(items);
    expect(items[0]?.draft.id).toBe('b');
  });
});

describe('joinPendingAccounts', () => {
  it('pairs each draft with its account and drops a draft whose account is unknown', () => {
    const joined = joinPendingAccounts(
      [makeDraft({ id: 'known' }), makeDraft({ id: 'orphan', accountId: 'acc-gone' })],
      [account]
    );
    expect(joined.map((i) => i.draft.id)).toEqual(['known']);
    expect(joined[0]?.account).toBe(account);
  });
});

describe('sourceLabel', () => {
  const more = (first: string, rest: number) => `${first} and ${rest} more`;
  const live = (provider: string) => `${provider} live feed`;

  it('names one file, counts the rest, and names the provider for a live draft', () => {
    expect(sourceLabel({ kind: 'file', dialectId: 'Amex', fileNames: ['a.csv'] }, more, live)).toBe(
      'a.csv'
    );
    expect(
      sourceLabel(
        { kind: 'file', dialectId: 'Amex', fileNames: ['a.csv', 'b.csv', 'c.csv'] },
        more,
        live
      )
    ).toBe('a.csv and 2 more');
    expect(sourceLabel({ kind: 'live', provider: 'up' }, more, live)).toBe('Up live feed');
  });

  it('falls back to the dialect when a file draft carries no names', () => {
    expect(sourceLabel({ kind: 'file', dialectId: 'ANZ', fileNames: [] }, more, live)).toBe('ANZ');
  });
});

describe('daysBetween', () => {
  it('rounds to whole days and never goes negative', () => {
    expect(daysBetween('2026-09-01T00:00:00Z', '2026-09-04T13:00:00Z')).toBe(4);
    expect(daysBetween('2026-09-01T00:00:00Z', '2026-09-01T02:00:00Z')).toBe(0);
    expect(daysBetween('2026-09-05T00:00:00Z', '2026-09-01T00:00:00Z')).toBe(0);
  });
});
