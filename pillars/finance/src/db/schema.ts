/**
 * Finance domain table barrel.
 *
 * Canonical definitions for finance-owned tables (transactions, transaction
 * tag rules, budgets, corrections, tag vocabulary, wishlist, tier overrides)
 * live in this package per PRD-245 US-03 (audit H6/H7).
 *
 *
 * `entities` is re-exported from `@pops/shared-schema` — the canonical
 * cross-pillar owner per PRD-245 US-07. Previously this barrel pulled from
 * `@pops/core-db`; the shared defs were extracted out of core-db so finance
 * no longer depends on it.
 */
export { entities, ENTITY_TYPES } from '@pops/shared-schema';

export { budgets } from './schema/budgets.js';
export { transactionCorrections } from './schema/corrections.js';
export { tagVocabulary } from './schema/tag-vocabulary.js';
export { tierOverrides } from './schema/tier-overrides.js';
export { transactionTagRules } from './schema/transaction-tag-rules.js';
export { transactions } from './schema/transactions.js';
export { wishList } from './schema/wishlist.js';
