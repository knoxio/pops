/**
 * Thin wrapper around `@pops/finance-db`'s wish-list service.
 *
 * Resolves the singleton `getDrizzle()` handle and forwards. Translates
 * the package's typed errors to the HTTP-layer error variants the rest
 * of pops-api still expects (`NotFoundError`) so the global error handler
 * keeps producing the same status codes and i18n keys it did before the
 * finance pillar Phase 1 split.
 *
 * This shim is deleted in Phase 1 PR 4. Existing callers (`router.ts`,
 * `wishlist.test.ts`) keep importing from here unchanged; the deletion
 * PR also flips them to the package directly and drops this file.
 */
import {
  wishListService,
  WishListItemNotFoundError,
  type WishListPriority,
  WISH_LIST_PRIORITIES,
} from '@pops/finance-db';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';

import type {
  CreateWishListItemInput,
  UpdateWishListItemInput,
  WishListListResult,
  WishListRow,
} from '@pops/finance-db';

export type { WishListListResult, WishListRow };

const PRIORITY_LOOKUP: ReadonlySet<string> = new Set(WISH_LIST_PRIORITIES);

/** Type-guard: turn an opaque string filter into the package's typed priority. */
function asPriority(value: string | undefined): WishListPriority | undefined {
  if (value === undefined || !PRIORITY_LOOKUP.has(value)) return undefined;
  return value as WishListPriority;
}

export function listWishListItems(
  search: string | undefined,
  priority: string | undefined,
  limit: number,
  offset: number
): WishListListResult {
  // Preserve pre-cutover wire semantics: the original SQL filter applied
  // an `eq(priority, <any-string>)` for any non-empty value, so an
  // unknown priority matched zero rows. The package's typed query drops
  // invalid values entirely, which would return ALL rows — a silent
  // behaviour change. Short-circuit here to keep the empty-page result.
  if (priority !== undefined && priority !== '' && !PRIORITY_LOOKUP.has(priority)) {
    return { rows: [], total: 0 };
  }
  return wishListService.listWishListItems(getDrizzle(), {
    search,
    priority: asPriority(priority),
    limit,
    offset,
  });
}

export function getWishListItem(id: string): WishListRow {
  try {
    return wishListService.getWishListItem(getDrizzle(), id);
  } catch (err) {
    if (err instanceof WishListItemNotFoundError) {
      throw new NotFoundError('Wish list item', id);
    }
    throw err;
  }
}

export function createWishListItem(input: CreateWishListItemInput): WishListRow {
  return wishListService.createWishListItem(getDrizzle(), input);
}

export function updateWishListItem(id: string, input: UpdateWishListItemInput): WishListRow {
  try {
    return wishListService.updateWishListItem(getDrizzle(), id, input);
  } catch (err) {
    if (err instanceof WishListItemNotFoundError) {
      throw new NotFoundError('Wish list item', id);
    }
    throw err;
  }
}

export function deleteWishListItem(id: string): void {
  try {
    wishListService.deleteWishListItem(getDrizzle(), id);
  } catch (err) {
    if (err instanceof WishListItemNotFoundError) {
      throw new NotFoundError('Wish list item', id);
    }
    throw err;
  }
}
