import type { FinanceError } from './errors.js';
import type { FinanceRouter } from './router.js';
import type { WishListItem } from './types/wish-list-item.js';

/**
 * Structural snapshot of the finance pillar's public surface. The registry
 * (Epic 02 / PRD-161) serves this shape; the iOS Swift codegen reads it via
 * the OpenAPI sibling; PRD-154's semver CI diffs it.
 *
 * Hand-maintained for now; PRD-155 replaces this with a generator that
 * derives the structure from the per-entity exports.
 */
export interface FinanceContract {
  readonly pillar: 'finance';
  readonly version: string;
  readonly entities: {
    readonly wishListItem: WishListItem;
  };
  readonly errors: FinanceError;
  readonly router: FinanceRouter;
}
