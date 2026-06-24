/**
 * Inferred `Row`/`Insert` aliases for finance tables that don't have a
 * dedicated service. Service-owned types (`TransactionRow`,
 * `BudgetRow`, `WishListRow`, `TagVocabularyRow`,
 * `TransactionTagRuleRow`, `TransactionCorrectionRow`) live in their
 * respective service modules and are re-exported from `./index.ts`.
 *
 * Hosted here so consumers can pull all finance row shapes from a single
 * `@pops/finance` entry point.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  budgets,
  tierOverrides,
  transactionCorrections,
  transactions,
  wishList,
} from './schema.js';

export type TransactionInsert = InferInsertModel<typeof transactions>;
export type BudgetInsert = InferInsertModel<typeof budgets>;
export type WishListInsert = InferInsertModel<typeof wishList>;
export type TransactionCorrectionInsert = InferInsertModel<typeof transactionCorrections>;

export type TierOverrideRow = InferSelectModel<typeof tierOverrides>;
export type TierOverrideInsert = InferInsertModel<typeof tierOverrides>;
