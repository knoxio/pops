/**
 * Locations tRPC router — CRUD procedures for the location tree.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../../trpc.js";
import { CreateLocationSchema, UpdateLocationSchema, toLocation } from "./types.js";
import * as service from "./service.js";
import { NotFoundError, ConflictError } from "../../../shared/errors.js";

export const locationsRouter = router({
  /** Get the full location tree as nested nodes. */
  tree: protectedProcedure.query(() => {
    return { data: service.getLocationTree() };
  }),

  /** List all locations (flat). */
  list: protectedProcedure.query(() => {
    const { rows, total } = service.listLocations();
    return {
      data: rows.map(toLocation),
      total,
    };
  }),

  /** Get a single location by ID. */
  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ input }) => {
    try {
      const row = service.getLocation(input.id);
      return { data: toLocation(row) };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Get children of a location (one level deep). */
  children: protectedProcedure.input(z.object({ parentId: z.string() })).query(({ input }) => {
    const rows = service.getChildren(input.parentId);
    return { data: rows.map(toLocation) };
  }),

  /** Create a new location. */
  create: protectedProcedure.input(CreateLocationSchema).mutation(({ input }) => {
    try {
      const row = service.createLocation(input);
      return {
        data: toLocation(row),
        message: "Location created",
      };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),

  /** Update an existing location (rename, move, reorder). */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: UpdateLocationSchema,
      })
    )
    .mutation(({ input }) => {
      try {
        const row = service.updateLocation(input.id, input.data);
        return {
          data: toLocation(row),
          message: "Location updated",
        };
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: err.message });
        }
        if (err instanceof ConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw err;
      }
    }),

  /** Delete a location (cascade deletes children). */
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(({ input }) => {
    try {
      service.deleteLocation(input.id);
      return { message: "Location deleted" };
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: err.message });
      }
      throw err;
    }
  }),
});
