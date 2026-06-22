/**
 * Finance domain table barrel.
 *
 * Canonical definitions for finance-owned tables (transactions, transaction
 * tag rules, budgets, corrections, tag vocabulary, wishlist, tier overrides)
 * live in this package per PRD-245 US-03 (audit H6/H7).
 *
 * `entities` is canonically owned by core; finance keeps a byte-compatible
 * local copy (`./schema/entities.ts`) of the table for its entity-usage
 * rollup, so the pillar is self-contained with no cross-pillar dependency.
 */
export { entities, ENTITY_TYPES } from './schema/entities.js';

export { budgets } from './schema/budgets.js';
export { transactionCorrections } from './schema/corrections.js';
export { tagVocabulary } from './schema/tag-vocabulary.js';
export { tierOverrides } from './schema/tier-overrides.js';
export { settings } from './schema/settings.js';
export { transactionTagRules } from './schema/transaction-tag-rules.js';
export { transactions } from './schema/transactions.js';
export { wishList } from './schema/wishlist.js';
