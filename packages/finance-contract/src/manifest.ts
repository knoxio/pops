import type { FinanceError } from './errors.js';
import type { FinanceRouter } from './router.js';
import type { WishListItem } from './types/wish-list-item.js';

/**
 * Structural snapshot of the finance pillar's public surface. The registry
 * (Epic 02 / PRD-161) will serve this shape; the iOS Swift codegen will read
 * it via the OpenAPI sibling (planned in PRD-153 US-04 — not yet shipped);
 * PRD-154's semver CI will diff it.
 *
 * Hand-maintained for now; PRD-155 will replace this with a generator that
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
