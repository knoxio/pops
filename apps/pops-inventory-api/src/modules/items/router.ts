/**
 * Inventory items tRPC router — CRUD procedures for inventory items.
 *
 * Migrated from `apps/pops-api/src/modules/inventory/items/router.ts` as
 * part of Theme 13 PRD-173 PR 1 (writer move). Procedure paths stay
 * rooted at `inventory.items.*` so the dispatcher cutover in PR 3 of
 * the slice can be a transparent URL swap rather than a path rename.
 * The DB handle is injected via `ctx.inventoryDb` from the tRPC context
 * rather than reached through a module-global getter — same pattern the
 * locations writer-move (#2891) established.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { NotFoundError } from '../../shared/errors.js';
import { paginationMeta, PaginationMetaSchema } from '../../shared/pagination.js';
import { protectedProcedure, router } from '../../trpc.js';
import * as service from './service.js';
import {
  CreateInventoryItemSchema,
  InventoryItemSchema,
  InventoryQuerySchema,
  toInventoryItem,
  UpdateInventoryItemSchema,
} from './types.js';

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const itemsRouter = router({
  /** List inventory items with optional filters and pagination. */
  list: protectedProcedure
    .input(InventoryQuerySchema)
    .output(
      z.object({
        data: z.array(InventoryItemSchema),
        pagination: PaginationMetaSchema,
        totals: z.object({ totalReplacementValue: z.number(), totalResaleValue: z.number() }),
      })
    )
    .query(({ input, ctx }) => {
      const limit = input.limit ?? DEFAULT_LIMIT;
      const offset = input.offset ?? DEFAULT_OFFSET;

      const parseTriBool = (value: string | undefined): boolean | undefined => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        return undefined;
      };
      const inUse = parseTriBool(input.inUse);
      const deductible = parseTriBool(input.deductible);

      const { rows, total, totalReplacementValue, totalResaleValue } = service.listInventoryItems(
        ctx.inventoryDb,
        {
          search: input.search,
          room: input.room,
          type: input.type,
          condition: input.condition,
          inUse,
          deductible,
          limit,
          offset,
          locationId: input.locationId,
          assetId: input.assetId,
          includeChildren: input.includeChildren,
        }
      );

      return {
        data: rows.map(toInventoryItem),
        pagination: paginationMeta(total, limit, offset),
        totals: { totalReplacementValue, totalResaleValue },
      };
    }),

  /** Search for an item by exact asset ID (case-insensitive). Returns null if not found. */
  searchByAssetId: protectedProcedure
    .input(z.object({ assetId: z.string().min(1) }))
    .query(({ input, ctx }) => {
      const row = service.searchByAssetId(ctx.inventoryDb, input.assetId);
      return { data: row ? toInventoryItem(row) : null };
    }),

  /** Count items whose assetId starts with the given prefix (case-insensitive). */
  countByAssetPrefix: protectedProcedure
    .input(z.object({ prefix: z.string().min(1) }))
    .query(({ input, ctx }) => {
      return { data: service.countByAssetPrefix(ctx.inventoryDb, input.prefix) };
    }),

  /** Return distinct item types from the database. */
  distinctTypes: protectedProcedure.query(({ ctx }) => {
    return { data: service.getDistinctTypes(ctx.inventoryDb) };
  }),

  /** Get a single inventory item by ID. */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.object({ data: InventoryItemSchema }))
    .query(({ input, ctx }) => {
      try {
        const row = service.getInventoryItem(ctx.inventoryDb, input.id);
        return { data: toInventoryItem(row) };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
        }
        throw err;
      }
    }),

  /** Create a new inventory item. */
  create: protectedProcedure.input(CreateInventoryItemSchema).mutation(({ input, ctx }) => {
    const row = service.createInventoryItem(ctx.inventoryDb, input);
    return {
      data: toInventoryItem(row),
      message: 'Inventory item created',
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
    .mutation(({ input, ctx }) => {
      try {
        const row = service.updateInventoryItem(ctx.inventoryDb, input.id, input.data);
        return {
          data: toInventoryItem(row),
          message: 'Inventory item updated',
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
        }
        throw err;
      }
    }),

  /** Delete an inventory item. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input, ctx }) => {
    try {
      service.deleteInventoryItem(ctx.inventoryDb, input.id);
      return { message: 'Inventory item deleted' };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      }
      throw err;
    }
  }),
});
