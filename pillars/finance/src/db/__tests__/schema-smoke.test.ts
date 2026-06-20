/**
 * Smoke test that the relocated finance schemas (PRD-245 US-03 / audit H6)
 * resolve from `@pops/finance-db` with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-03-relocate-finance-schemas.md` so a regression on either side
 * trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  budgets,
  tagVocabulary,
  tierOverrides,
  transactionCorrections,
  transactionTagRules,
  transactions,
  wishList,
} from '../schema.js';

describe('PRD-245 US-03 finance schema relocation', () => {
  it.each([
    [budgets, 'budgets'],
    [tagVocabulary, 'tag_vocabulary'],
    [tierOverrides, 'tier_overrides'],
    [transactionCorrections, 'transaction_corrections'],
    [transactionTagRules, 'transaction_tag_rules'],
    [transactions, 'transactions'],
    [wishList, 'wish_list'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
