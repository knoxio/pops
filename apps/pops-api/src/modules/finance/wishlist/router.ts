/**
 * Wish list tRPC router — CRUD procedures for wish list items.
 *
 * Calls into `@pops/finance-db`'s wish-list service directly (the in-tree
 * shim was retired in PR 4 of the finance pillar Phase 1 sequence).
 *
 * Domain errors from the package (`WishListItemNotFoundError`) are
 * translated to `HttpError` subclasses inside each handler and then
 * routed through `mapDomainErrors` / `mapDomainErrorsAsync` so the tRPC
 * layer sees a proper `TRPCError` with the right wire-level `code`
 * (e.g. `NOT_FOUND`). Throwing `HttpError` directly out of a tRPC
 * handler surfaces as `INTERNAL_SERVER_ERROR` at the OpenAPI boundary,
 * which we don't want.
 */
import { z } from 'zod';

import {
  wishListService,
  WishListItemNotFoundError,
  WISH_LIST_PRIORITIES,
  type WishListPriority,
} from '@pops/finance-db';

import { getDrizzle } from '../../../db.js';
import { NotFoundError } from '../../../shared/errors.js';
import { paginationMeta } from '../../../shared/pagination.js';
import { mapDomainErrors } from '../../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../../trpc.js';
import {
  CreateWishListItemSchema,
  toWishListItem,
  UpdateWishListItemSchema,
  WishListQuerySchema,
} from './types.js';

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

const PRIORITY_LOOKUP: ReadonlySet<string> = new Set(WISH_LIST_PRIORITIES);

/**
 * Preserve the pre-pillar wire semantic: the original SQL filter applied
 * `eq(priority, '<any-string>')` for any non-empty value, so an unknown
 * priority matched zero rows. The package's typed query drops invalid
 * values entirely, which would return ALL rows — a silent behaviour
 * change. The router short-circuits unknown values instead.
 */
function asKnownPriority(value: string | undefined): {
  valid: boolean;
  typed: WishListPriority | undefined;
} {
  if (value === undefined || value === '') return { valid: true, typed: undefined };
  if (!PRIORITY_LOOKUP.has(value)) return { valid: false, typed: undefined };
  return { valid: true, typed: value as WishListPriority };
}

export const wishlistRouter = router({
  /** List wish list items with optional search/priority filters and pagination. */
  list: protectedProcedure.input(WishListQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { valid, typed } = asKnownPriority(input.priority);
    if (!valid) {
      return {
        data: [],
        pagination: paginationMeta(0, limit, offset),
      };
    }

    const { rows, total } = wishListService.listWishListItems(getDrizzle(), {
      search: input.search,
      priority: typed,
      limit,
      offset,
    });

    return {
      data: rows.map(toWishListItem),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single wish list item by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) =>
    mapDomainErrors(() => {
      try {
        const row = wishListService.getWishListItem(getDrizzle(), input.id);
        return { data: toWishListItem(row) };
      } catch (err) {
        if (err instanceof WishListItemNotFoundError) {
          throw new NotFoundError('Wish list item', input.id);
        }
        throw err;
      }
    })
  ),

  /** Create a new wish list item. */
  create: protectedProcedure.input(CreateWishListItemSchema).mutation(({ input }) => {
    const row = wishListService.createWishListItem(getDrizzle(), input);
    return {
      data: toWishListItem(row),
      message: 'Wish list item created',
    };
  }),

  /** Update an existing wish list item. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateWishListItemSchema,
      })
    )
    .mutation(({ input }) =>
      mapDomainErrors(() => {
        try {
          const row = wishListService.updateWishListItem(getDrizzle(), input.id, input.data);
          return {
            data: toWishListItem(row),
            message: 'Wish list item updated',
          };
        } catch (err) {
          if (err instanceof WishListItemNotFoundError) {
            throw new NotFoundError('Wish list item', input.id);
          }
          throw err;
        }
      })
    ),

  /** Delete a wish list item. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) =>
    mapDomainErrors(() => {
      try {
        wishListService.deleteWishListItem(getDrizzle(), input.id);
        return { message: 'Wish list item deleted' };
      } catch (err) {
        if (err instanceof WishListItemNotFoundError) {
          throw new NotFoundError('Wish list item', input.id);
        }
        throw err;
      }
    })
  ),
});
