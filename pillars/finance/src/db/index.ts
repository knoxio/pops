/**
 * Backend-safe barrel for the finance domain's persistence layer.
 *
 * Hosts finance-owned tables (transactions, budgets, wish list, tag rules,
 * tag vocabulary, corrections) and re-exports each table's service plus its
 * row/input types from a single entry point.
 */
export * from './errors.js';
export * from './row-types.js';
export * from './schema.js';

export type { FinanceDb } from './services/internal.js';

export { openFinanceDb, type OpenedFinanceDb } from './open-finance-db.js';

export * as wishListService from './services/wishlist.js';

export {
  WISH_LIST_PRIORITIES,
  type WishListPriority,
  type WishListRow,
  type CreateWishListItemInput,
  type UpdateWishListItemInput,
  type WishListListResult,
  type WishListQuery,
} from './services/wishlist.js';

export * as tagVocabularyService from './services/tag-vocabulary.js';

export { type TagVocabularyRow, type TagVocabularySource } from './services/tag-vocabulary.js';

export * as transactionTagRulesService from './services/transaction-tag-rules.js';

export {
  type TransactionTagRuleRow,
  type TagRuleMatchType,
  type CreateTransactionTagRuleInput,
  type UpdateTransactionTagRuleInput,
} from './services/transaction-tag-rules.js';

export * as transactionsService from './services/transactions.js';

export {
  type CreateTransactionInput,
  type TransactionFilters,
  type TransactionListResult,
  type TransactionRow,
  type UpdateTransactionInput,
} from './services/transactions.js';

export * as importsService from './services/imports.js';

export type {
  EntityLookupEntry,
  EntityMaps,
  InsertImportTransactionInput,
  ImportTransactionRow,
} from './services/imports.js';

export * as budgetsService from './services/budgets.js';

export type {
  BudgetRow,
  BudgetWithSpend,
  BudgetListResult,
  CreateBudgetInput,
  UpdateBudgetInput,
  ListBudgetsOptions,
} from './services/budgets.js';

export * as transactionCorrectionsService from './services/transaction-corrections.js';

export {
  type TransactionCorrectionRow,
  type TransactionCorrectionMatchType,
  type TransactionCorrectionTransactionType,
  type CreateTransactionCorrectionInput,
  type UpdateTransactionCorrectionInput,
  type TransactionCorrectionListResult,
  type TransactionCorrectionListQuery,
} from './services/transaction-corrections.js';

export * as crossPillarService from './services/cross-pillar.js';

export { listEntityUsage } from './services/entity-usage.js';

export type {
  EntityUsageRow,
  EntityUsageListResult,
  ListEntityUsageOptions,
} from './services/entity-usage.js';
