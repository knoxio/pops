/**
 * Wish list tRPC router — CRUD procedures for wish list items.
 *
 * Migrated from `apps/pops-api/src/modules/finance/wishlist/router.ts`
 * as part of Phase 5 PR 1 (Track M2). The finance DB handle is injected
 * via the tRPC context rather than reached through `getFinanceDrizzle()`
 * so finance-api stands alone of pops-api in the dep graph. Procedure
 * paths stay rooted at `finance.wishlist.*` for a transparent
 * dispatcher swap in Phase 5 PR 2.
 *
 * Domain errors from `@pops/finance-db` (`WishListItemNotFoundError`)
 * are translated to local `HttpError` subclasses inside each handler
 * and then routed through `mapDomainErrors` so the tRPC layer sees a
 * proper `TRPCError` with the right wire-level `code` (e.g.
 * `NOT_FOUND`).
 */
import { z } from 'zod';

import {
  wishListService,
  WishListItemNotFoundError,
  WISH_LIST_PRIORITIES,
  type WishListPriority,
} from '@pops/finance-db';

import { NotFoundError } from '../../shared/errors.js';
import { paginationMeta } from '../../shared/pagination.js';
import { mapDomainErrors } from '../../shared/trpc-error-mapper.js';
import { protectedProcedure, router } from '../../trpc.js';
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
  list: protectedProcedure.input(WishListQuerySchema).query(({ input, ctx }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { valid, typed } = asKnownPriority(input.priority);
    if (!valid) {
      return {
        data: [],
        pagination: paginationMeta(0, limit, offset),
      };
    }

    const { rows, total } = wishListService.listWishListItems(ctx.financeDb, {
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
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        const row = wishListService.getWishListItem(ctx.financeDb, input.id);
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
  create: protectedProcedure.input(CreateWishListItemSchema).mutation(({ input, ctx }) => {
    const row = wishListService.createWishListItem(ctx.financeDb, input);
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
    .mutation(({ input, ctx }) =>
      mapDomainErrors(() => {
        try {
          const row = wishListService.updateWishListItem(ctx.financeDb, input.id, input.data);
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
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) =>
    mapDomainErrors(() => {
      try {
        wishListService.deleteWishListItem(ctx.financeDb, input.id);
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
