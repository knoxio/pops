/**
 * Backend-safe barrel for the finance domain's persistence layer.
 *
 * Hosts finance-owned tables (transactions, budgets, wish list, tag rules,
 * tag vocabulary, corrections). Extracted from
 * `apps/pops-api/src/modules/finance/` as the first mature-pillar migration
 * following the core pilot, per ADR-026.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and moves only the `wish-list` slice. The other
 * slices (budgets, transactions, imports, tag rules, tag vocabulary, URI
 * dispatcher) follow in subsequent PRs.
 */
export * from './errors.js';
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
