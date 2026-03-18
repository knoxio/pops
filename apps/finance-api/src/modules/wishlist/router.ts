/**
 * Wish list tRPC router — CRUD procedures for wish list items.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc.js";
import { paginationMeta } from "../../shared/pagination.js";
import {
  CreateWishListItemSchema,
  UpdateWishListItemSchema,
  WishListQuerySchema,
  toWishListItem,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../shared/errors.js";

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const wishlistRouter = router({
  /** List wish list items with optional search/priority filters and pagination. */
  list: protectedProcedure.input(WishListQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const { rows, total } = service.listWishListItems(input.search, input.priority, limit, offset);

    return {
      data: rows.map(toWishListItem),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single wish list item by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getWishListItem(input.id);
      return { data: toWishListItem(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Create a new wish list item. */
  create: protectedProcedure.input(CreateWishListItemSchema).mutation(({ input }) => {
    const row = service.createWishListItem(input);
    return {
      data: toWishListItem(row),
      message: "Wish list item created",
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
    .mutation(({ input }) => {
      try {
        const row = service.updateWishListItem(input.id, input.data);
        return {
          data: toWishListItem(row),
          message: "Wish list item updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** Delete a wish list item. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteWishListItem(input.id);
      return { message: "Wish list item deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
