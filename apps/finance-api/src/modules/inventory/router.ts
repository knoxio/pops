/**
 * Inventory tRPC router — CRUD procedures for inventory items.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc.js";
import { paginationMeta } from "../../shared/pagination.js";
import {
  CreateInventoryItemSchema,
  UpdateInventoryItemSchema,
  InventoryQuerySchema,
  toInventoryItem,
} from "./types.js";
import * as service from "./service.js";
import { NotFoundError } from "../../shared/errors.js";

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const inventoryRouter = router({
  /** List inventory items with optional filters and pagination. */
  list: protectedProcedure.input(InventoryQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const inUse = input.inUse === "true" ? true : input.inUse === "false" ? false : undefined;
    const deductible =
      input.deductible === "true" ? true : input.deductible === "false" ? false : undefined;

    const { rows, total } = service.listInventoryItems(
      input.search,
      input.room,
      input.type,
      input.condition,
      inUse,
      deductible,
      limit,
      offset
    );

    return {
      data: rows.map(toInventoryItem),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single inventory item by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getInventoryItem(input.id);
      return { data: toInventoryItem(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Create a new inventory item. */
  create: protectedProcedure.input(CreateInventoryItemSchema).mutation(({ input }) => {
    const row = service.createInventoryItem(input);
    return {
      data: toInventoryItem(row),
      message: "Inventory item created",
    };
  }),

  /** Update an existing inventory item. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateInventoryItemSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateInventoryItem(input.id, input.data);
        return {
          data: toInventoryItem(row),
          message: "Inventory item updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** Delete an inventory item. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteInventoryItem(input.id);
      return { message: "Inventory item deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
