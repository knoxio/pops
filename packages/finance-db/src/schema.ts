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
 * `entities` is exported via a local schema-equivalent shadow because the
 * canonical core relocation (PRD-245 US-07) has not landed yet — pulling
 * the canonical definition would require a workspace dep on `@pops/db-types`
 * which collides with the transition-shim direction. See
 * `./schema/entities-shadow.ts` for the duplication rationale.
 */
export { entities } from './schema/entities-shadow.js';

export { budgets } from './schema/budgets.js';
export { transactionCorrections } from './schema/corrections.js';
export { tagVocabulary } from './schema/tag-vocabulary.js';
export { tierOverrides } from './schema/tier-overrides.js';
export { transactionTagRules } from './schema/transaction-tag-rules.js';
export { transactions } from './schema/transactions.js';
export { wishList } from './schema/wishlist.js';
