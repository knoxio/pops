/**
 * Finance domain table barrel.
 *
 * Canonical definitions for finance-owned tables (transactions, transaction
 * tag rules, budgets, corrections, tag vocabulary, wishlist, tier overrides)
 * live in this package per PRD-245 US-03 (audit H6/H7).
 *
 * `@pops/db-types` re-exports these tables as a transition shim so legacy
 * import sites keep compiling until PRD-245 US-08 deletes the shim. Pillar
 * consumers should import from `@pops/finance-db` directly.
 *
 * `entities` is re-exported from `@pops/core-db` — the canonical owner per
 * PRD-245 US-07. Previously this barrel pulled from a local schema-shadow
 * because db-types still owned `entities`; that shadow is now deleted.
 */
export { entities } from '@pops/core-db';

export { budgets } from './schema/budgets.js';
export { transactionCorrections } from './schema/corrections.js';
export { tagVocabulary } from './schema/tag-vocabulary.js';
export { tierOverrides } from './schema/tier-overrides.js';
export { transactionTagRules } from './schema/transaction-tag-rules.js';
export { transactions } from './schema/transactions.js';
export { wishList } from './schema/wishlist.js';
