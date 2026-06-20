/**
 * Handlers for the `wishlist.*` sub-router.
 *
 * `asKnownPriority` preserves the pre-pillar wire semantic: the original
 * SQL filter applied `eq(priority, '<any-string>')` for any non-empty
 * value, so an unknown priority matched zero rows. The package's typed
 * query drops invalid values entirely (which would return ALL rows), so
 * the handler short-circuits unknown values to an empty page instead.
 */
import {
  type FinanceDb,
  WISH_LIST_PRIORITIES,
  WishListItemNotFoundError,
  type WishListPriority,
  wishListService,
} from '../../db/index.js';
import { toWishListItem } from '../modules/wishlist-types.js';
import { NotFoundError } from '../shared/errors.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { financeWishlistContract } from '../../contract/rest-wishlist.js';
import type { WishListItem } from '../modules/wishlist-types.js';

type Req = ServerInferRequest<typeof financeWishlistContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

const PRIORITY_LOOKUP: ReadonlySet<string> = new Set(WISH_LIST_PRIORITIES);

function asKnownPriority(value: string | undefined): {
  valid: boolean;
  typed: WishListPriority | undefined;
} {
  if (value === undefined || value === '') return { valid: true, typed: undefined };
  if (!PRIORITY_LOOKUP.has(value)) return { valid: false, typed: undefined };
  return { valid: true, typed: value as WishListPriority };
}

export function makeWishlistHandlers(db: FinanceDb) {
  return {
    list: ({ query }: Req['list']) =>
      runHttp(() => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;

        const { valid, typed } = asKnownPriority(query.priority);
        if (!valid) {
          return {
            status: 200 as const,
            body: { data: [] as WishListItem[], pagination: paginationMeta(0, limit, offset) },
          };
        }

        const { rows, total } = wishListService.listWishListItems(db, {
          search: query.search,
          priority: typed,
          limit,
          offset,
        });

        return {
          status: 200 as const,
          body: {
            data: rows.map(toWishListItem),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),

    get: ({ params }: Req['get']) =>
      runHttp(() => {
        try {
          const row = wishListService.getWishListItem(db, params.id);
          return { status: 200 as const, body: { data: toWishListItem(row) } };
        } catch (err) {
          if (err instanceof WishListItemNotFoundError) {
            throw new NotFoundError('Wish list item', params.id);
          }
          throw err;
        }
      }),

    create: ({ body }: Req['create']) =>
      runHttp(() => {
        const row = wishListService.createWishListItem(db, body);
        return {
          status: 201 as const,
          body: { data: toWishListItem(row), message: 'Wish list item created' },
        };
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(() => {
        try {
          const row = wishListService.updateWishListItem(db, params.id, body);
          return {
            status: 200 as const,
            body: { data: toWishListItem(row), message: 'Wish list item updated' },
          };
        } catch (err) {
          if (err instanceof WishListItemNotFoundError) {
            throw new NotFoundError('Wish list item', params.id);
          }
          throw err;
        }
      }),

    delete: ({ params }: Req['delete']) =>
      runHttp(() => {
        try {
          wishListService.deleteWishListItem(db, params.id);
          return { status: 200 as const, body: { message: 'Wish list item deleted' } };
        } catch (err) {
          if (err instanceof WishListItemNotFoundError) {
            throw new NotFoundError('Wish list item', params.id);
          }
          throw err;
        }
      }),
  };
}
