/**
 * Budget tRPC router — CRUD procedures for budgets.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../trpc.js";
import { paginationMeta } from "../../shared/pagination.js";
import { CreateBudgetSchema, UpdateBudgetSchema, BudgetQuerySchema, toBudget } from "./types.js";
import * as service from "./service.js";
import { NotFoundError, ConflictError } from "../../shared/errors.js";

/** Default pagination values. */
const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

export const budgetsRouter = router({
  /** List budgets with optional search/period/active filters and pagination. */
  list: protectedProcedure.input(BudgetQuerySchema).query(({ input }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? DEFAULT_OFFSET;

    const activeFilter =
      input.active === "true" ? true : input.active === "false" ? false : undefined;

    const { rows, total } = service.listBudgets(
      input.search,
      input.period,
      activeFilter,
      limit,
      offset
    );

    return {
      data: rows.map(toBudget),
      pagination: paginationMeta(total, limit, offset),
    };
  }),

  /** Get a single budget by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getBudget(input.id);
      return { data: toBudget(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Create a new budget. */
  create: protectedProcedure.input(CreateBudgetSchema).mutation(({ input }) => {
    try {
      const row = service.createBudget(input);
      return {
        data: toBudget(row),
        message: "Budget created",
      };
    } catch (err) {
      if (err instanceof ConflictError) {
        throw new TRPCError({ code: "CONFLICT", message: err.message });
      }
      throw err;
    }
  }),

  /** Update an existing budget. */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateBudgetSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateBudget(input.id, input.data);
        return {
          data: toBudget(row),
          message: "Budget updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        throw err;
      }
    }),

  /** Delete a budget. */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteBudget(input.id);
      return { message: "Budget deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
