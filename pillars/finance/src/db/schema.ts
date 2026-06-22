/**
 * Finance domain table barrel.
 *
 * Canonical definitions for finance-owned tables (transactions, transaction
 * tag rules, budgets, corrections, tag vocabulary, wishlist, tier overrides)
 * live in this package per PRD-245 US-03 (audit H6/H7).
 *
 * Entities are owned by the contacts pillar — finance keeps NO mirror table.
 * The import matcher and entity-usage rollup fetch the contact set live from
 * contacts over the pillar SDK (PRD-163 US-03/US-06). `ENTITY_TYPES` remains a
 * finance-local enum because it constrains finance wire shapes.
 */
export { ENTITY_TYPES } from './entity-types.js';

export { budgets } from './schema/budgets.js';
export { transactionCorrections } from './schema/corrections.js';
export { tagVocabulary } from './schema/tag-vocabulary.js';
export { tierOverrides } from './schema/tier-overrides.js';
export { settings } from './schema/settings.js';
export { transactionTagRules } from './schema/transaction-tag-rules.js';
export { transactions } from './schema/transactions.js';
export { wishList } from './schema/wishlist.js';
