import type { ConfirmedTransaction } from '@pops/api/modules/finance/imports';
import { describe, expect, it } from 'vitest';

import { computeLearnableTags, descriptionPatternFromGroup } from './tag-rule-learn-helpers';

function txn(
  overrides: Partial<ConfirmedTransaction> & { checksum: string }
): ConfirmedTransaction {
  return {
    date: '2026-01-01',
    description: 'X',
    amount: -1,
    account: 'Amex',
    rawRow: '{}',
    ...overrides,
  };
}

describe('descriptionPatternFromGroup', () => {
  it('returns empty string for no descriptions', () => {
    expect(descriptionPatternFromGroup([])).toBe('');
  });

  it('truncates a single description to 48 chars', () => {
    const long = 'A'.repeat(60);
    expect(descriptionPatternFromGroup([long])).toBe('A'.repeat(48));
  });

  it('finds longest common substring (min length 4)', () => {
    expect(
      descriptionPatternFromGroup(['WOOLWORTHS METRO 1', 'WOOLWORTHS ONLINE', 'WOOLWORTHS 123'])
    ).toBe('WOOLWORTHS');
  });

  it('falls back to a 16-char prefix when no common substring of length 4 exists', () => {
    expect(descriptionPatternFromGroup(['AB', 'CD'])).toBe('AB');
    expect(descriptionPatternFromGroup(['ABCDEFGH_ijkl', 'mnopqrstuvwxyz'])).toBe('ABCDEFGH_IJKL');
  });
});

describe('computeLearnableTags', () => {
  it('returns tags present locally but not in the initial snapshot', () => {
    const transactions = [
      txn({ checksum: 'a', description: 't1' }),
      txn({ checksum: 'b', description: 't2' }),
    ];
    const initialTags = { a: ['Groceries'], b: ['Groceries'] };
    const localTags = { a: ['Groceries', 'Online'], b: ['Groceries'] };
    expect(computeLearnableTags(transactions, localTags, initialTags)).toEqual(['Online']);
  });

  it('returns sorted union when multiple transactions contribute new tags', () => {
    const transactions = [txn({ checksum: 'a' }), txn({ checksum: 'b' })];
    const initialTags = { a: [], b: [] };
    const localTags = { a: ['Zebra'], b: ['Apple'] };
    expect(computeLearnableTags(transactions, localTags, initialTags)).toEqual(['Apple', 'Zebra']);
  });

  it('returns empty when nothing new was added', () => {
    const transactions = [txn({ checksum: 'a' })];
    const initialTags = { a: ['Groceries'] };
    const localTags = { a: ['Groceries'] };
    expect(computeLearnableTags(transactions, localTags, initialTags)).toEqual([]);
  });
});
